import {completeSubmittedVideo} from '../settings/connection-status';
import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import type {CoreClient} from '../../adapters/core/http-client';
import {getActiveCore} from '../../adapters/core/current-connection';
import {fetchCoreContent} from '../../adapters/core/content';
import {assetSchema,type Asset} from '../../domain/asset';
import {runSchema,type Run} from '../../domain/run';
import {probeMedia} from '../assets/media-probe';
import {hashBlob} from '../assets/hash-worker';
import {acquireMediaUrl} from './object-url-pool';
import {assertRunIdentity} from '../../infrastructure/storage/run-repository';
export type MediaIntent='preview'|'download'|'cache';
export type MediaDeliveryOptions={db?:StudioDb;client?:CoreClient;cacheBudgetBytes?:number};
export type MediaDeliveryResult={assetId:string;blobKey:string;deliveryState:'cached_local';objectUrl?:string;release?:()=>void};
export const automaticMediaCacheBudget=200*1024*1024;
type MediaLease={id:string;owner:string;epoch:number;expiresAt:number};
async function localResult(tx:IDBTransaction,run:Run){if(!run.resultAssetId)return;const raw=await requestResult(tx.objectStore('assets').get(run.resultAssetId));if(!raw)return;const asset=assetSchema.parse(raw);if(asset.sourceRunId!==run.id)throw Error('media_source_binding_mismatch');const stored=await requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));return stored?{asset,blob:stored.blob}:undefined;}
async function cacheSize(tx:IDBTransaction){const rows=await requestResult<{id:string;blob:Blob}[]>(tx.objectStore('blobs').getAll());return rows.reduce((sum,r)=>sum+(r.blob?.size??0),0);}
async function verifyLocal(asset:Asset,blob:Blob){if(blob.size!==asset.bytes||await hashBlob(blob)!==asset.sha256)throw Error('media_cached_integrity_failed');}
function delivery(asset:Asset,blob:Blob,intent:MediaIntent):MediaDeliveryResult{return {assetId:asset.id,blobKey:asset.blobKey,deliveryState:'cached_local',...(intent==='preview'?acquireMediaUrl(blob):{})};}
export async function fetchRunMedia(runId:string,intent:MediaIntent,options:MediaDeliveryOptions={}):Promise<MediaDeliveryResult>{
 if(!['preview','download','cache'].includes(intent))throw Error('media_intent_invalid');const budget=options.cacheBudgetBytes??automaticMediaCacheBudget;if(!Number.isSafeInteger(budget)||budget<=0||budget>automaticMediaCacheBudget)throw Error('media_budget_invalid');
 return withDatabase(options.db,async db=>{
  const initial=await transact(db,['runs','assets','blobs'],'readonly',async tx=>{const run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));return {run,cached:await localResult(tx,run)};});
  if(initial.run.executionState!=='succeeded')throw Error('media_not_ready');
  if(initial.cached){await verifyLocal(initial.cached.asset,initial.cached.blob);return delivery(initial.cached.asset,initial.cached.blob,intent);}
  const client=options.client??getActiveCore()?.client;if(!client||initial.run.authBindingId!==client.binding.id||initial.run.connectionId!==client.profile.id||initial.run.originSnapshot!==client.profile.originSnapshot)throw Error('original_authorization_required');
  const spec=initial.run.executionSpec;
  const observedGeneration=()=>spec?completeSubmittedVideo(runId,JSON.stringify([spec.durationSeconds??null,spec.ratio??'',spec.resolution??''])):false;
  const owner=crypto.randomUUID(),leaseId='media:'+runId,controller=new AbortController();
  const claim=await transact(db,['leases','runs','blobs'],'readwrite',async tx=>{
   const prior=await requestResult<MediaLease|undefined>(tx.objectStore('leases').get(leaseId));if(prior&&prior.expiresAt>Date.now())throw Error('media_fetch_busy');
   const run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));assertRunIdentity(initial.run,run);if(run.executionState!=='succeeded')throw Error('media_not_ready');
   const remaining=budget-await cacheSize(tx);if(remaining<=0)throw Error('media_cache_budget_exceeded');const lease:MediaLease={id:leaseId,owner,epoch:(prior?.epoch??0)+1,expiresAt:Date.now()+30000};tx.objectStore('leases').put(lease);tx.objectStore('runs').put({...run,deliveryState:'fetching',updatedAt:Date.now()});return {lease,remaining};
  });
  const assertOwner=async(tx:IDBTransaction)=>{const current=await requestResult<MediaLease|undefined>(tx.objectStore('leases').get(leaseId));if(!current||current.owner!==owner||current.epoch!==claim.lease.epoch||current.expiresAt<=Date.now())throw Error('media_lease_lost');return current;};
  const timer=setInterval(()=>{void transact(db,['leases'],'readwrite',async tx=>{const current=await assertOwner(tx);tx.objectStore('leases').put({...current,expiresAt:Date.now()+30000});}).catch(()=>controller.abort());},5000);
  try{
   const blob=await fetchCoreContent(initial.run,client,claim.remaining,controller.signal),metadata=await probeMedia(blob);if(!metadata.mimeType.startsWith('video/'))throw Error('media_content_invalid');if(typeof document!=='undefined'&&(!metadata.width||!metadata.height))throw Error('media_metadata_unavailable');const sha256=await hashBlob(blob);
   const asset=assetSchema.parse({id:initial.run.resultAssetId??'run-result:'+runId,sourceRunId:runId,sha256,blobKey:'sha256:'+sha256,title:'视频-'+runId+(metadata.mimeType==='video/webm'?'.webm':'.mp4'),mediaType:'video',...metadata,createdAt:Date.now()});
   await transact(db,['leases','runs','assets','blobs','diagnostics'],'readwrite',async tx=>{
    const currentLease=await assertOwner(tx),run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));assertRunIdentity(initial.run,run);if(run.executionState!=='succeeded')throw Error('media_not_ready');
    const existing=await requestResult<Asset|undefined>(tx.objectStore('assets').get(asset.id));if(existing&&(existing.sourceRunId!==runId||existing.sha256!==sha256))throw Error('media_source_binding_mismatch');
    const existingBlob=await requestResult(tx.objectStore('blobs').get(asset.blobKey));if(!existingBlob&&await cacheSize(tx)+blob.size>budget)throw Error('media_cache_budget_exceeded');
    tx.objectStore('blobs').put({id:asset.blobKey,blob});tx.objectStore('assets').put(existing??asset);tx.objectStore('runs').put({...run,resultAssetId:asset.id,deliveryState:'cached_local',updatedAt:Date.now()});tx.objectStore('leases').put({...currentLease,expiresAt:0});tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'media_cached',runId,assetId:asset.id,bytes:blob.size,at:Date.now()});
   });observedGeneration();return delivery(asset,blob,intent);
  }catch(error){await transact(db,['leases','runs'],'readwrite',async tx=>{const current=await requestResult<MediaLease|undefined>(tx.objectStore('leases').get(leaseId));if(current?.owner!==owner||current.epoch!==claim.lease.epoch)return;const run=runSchema.parse(await requestResult(tx.objectStore('runs').get(runId)));tx.objectStore('runs').put({...run,deliveryState:'download_failed',updatedAt:Date.now()});tx.objectStore('leases').put({...current,expiresAt:0});}).catch(()=>{});throw Error(storageErrorCode(error));}
  finally{clearInterval(timer);controller.abort();}
 });
}
export async function triggerBrowserDownload(assetId:string,options:{db?:StudioDb}={}):Promise<{status:'triggered'|'failed'}>{
 try{return await withDatabase(options.db,async db=>{
  const local=await transact(db,['assets','blobs'],'readonly',async tx=>{const raw=await requestResult(tx.objectStore('assets').get(assetId));if(!raw)throw Error('media_local_missing');const asset=assetSchema.parse(raw),stored=await requestResult<{blob:Blob}|undefined>(tx.objectStore('blobs').get(asset.blobKey));if(!stored)throw Error('media_local_missing');return {asset,blob:stored.blob};});await verifyLocal(local.asset,local.blob);if(typeof document==='undefined')return {status:'failed'};
  const url=acquireMediaUrl(local.blob),anchor=document.createElement('a');anchor.href=url.objectUrl;anchor.download=local.asset.title.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,180)||'studio-video';document.body.append(anchor);try{anchor.click();}finally{anchor.remove();setTimeout(url.release,60000);}
  if(local.asset.sourceRunId)await transact(db,['runs'],'readwrite',async tx=>{const raw=await requestResult(tx.objectStore('runs').get(local.asset.sourceRunId!));if(raw){const run=runSchema.parse(raw);if(run.resultAssetId===local.asset.id)tx.objectStore('runs').put({...run,deliveryState:'browser_download_triggered',updatedAt:Date.now()});}}).catch(()=>{});
  return {status:'triggered'};
 });}catch{return {status:'failed'};}
}
