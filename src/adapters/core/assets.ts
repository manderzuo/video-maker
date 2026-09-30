import {z} from 'zod';
import {assetSchema,type Asset} from '../../domain/asset';
import type {RunBinding} from '../../domain/common';
import type {CapabilityProfile} from '../../domain/connection';
import {transact,requestResult,withDatabase,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import type {CoreClient} from './http-client';
import {assertPreparation,type PreparationToken} from '../../application/runs/preparation-lock';
import {digestBlob} from '../../features/assets/hash-worker';
import {probeMedia} from '../../features/assets/media-probe';
import type {Run} from '../../domain/run';
import {fingerprintText} from '../../application/runs/fingerprint';
export type CoreAssetRef=RunBinding&{assetId:string;sha256:string;coreAssetId:string;expiresAt:number;createdAt:number};
export type AssetUploadInput={runId:string;asset:Asset;blob:Blob;binding:RunBinding;client:CoreClient;capability:CapabilityProfile;db?:StudioDb;lease?:ProjectLeaseToken;preparation?:PreparationToken};
const supported=new Map([['image/png','png'],['image/jpeg','jpg'],['image/gif','gif'],['image/webp','webp'],['video/mp4','mp4'],['video/webm','webm']]);
const responseSchema=z.object({object:z.literal('asset'),id:z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/),mime_type:z.string(),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),created_at:z.number().int().nonnegative(),expires_at:z.number().int().positive()});
type UploadJournal={id:string;owner:string;state:'pending'|'response_unknown'|'succeeded';mapping?:CoreAssetRef};
export function assertAssetBinding(binding:RunBinding,client:CoreClient){if(client.binding.id!==binding.authBindingId||client.profile.id!==binding.connectionId||client.binding.originSnapshot!==binding.originSnapshot)throw Error('original_authorization_required');}
export async function validateUploadAsset(asset:Asset,blob:Blob,capability:CapabilityProfile){
 assetSchema.parse(asset);
 if(asset.trashedAt!=null||!supported.has(asset.mimeType)||!['image','video'].includes(asset.mediaType)||!asset.mimeType.startsWith(asset.mediaType+'/'))throw Error('reference_media_unsupported');
 if(capability.verification==='unknown'||!capability.limits?.assetBytes)throw Error('asset_limit_unverified');
 if(blob.size!==asset.bytes||!blob.size||blob.size>Math.min(capability.limits.assetBytes,32*1024*1024))throw Error('reference_size_invalid');
 if((await probeMedia(blob)).mimeType!==asset.mimeType)throw Error('reference_mime_mismatch');
 if(await digestBlob(blob)!==asset.sha256)throw Error('reference_hash_mismatch');
}
export async function uploadCoreAsset(input:AssetUploadInput):Promise<CoreAssetRef>{
 const {asset,blob,binding,client}=input;assertAssetBinding(binding,client);await validateUploadAsset(asset,blob,input.capability);
 return withDatabase(input.db,async db=>{
  const id='core-asset:'+await fingerprintText(JSON.stringify([binding.connectionId,binding.authBindingId,binding.originSnapshot,asset.sha256])),owner=crypto.randomUUID();
  const prior=await transact(db,['runs','projects','leases','receipts'],'readwrite',async tx=>{
   const run:Run|undefined=await requestResult(tx.objectStore('runs').get(input.runId));if(!run)throw Error('run_missing');
   for(const key of ['connectionId','authBindingId','originSnapshot'] as const)if(run[key]!==binding[key])throw Error('original_authorization_required');
   if(run.finalBody||!['persisted','uploading'].includes(run.executionState))throw Error('run_request_frozen');
   await assertProjectWriter(tx,run.projectId,input.lease);await assertPreparation(tx,input.preparation);
   const project:{revision:number;trashedAt:number|null;archived:boolean}|undefined=await requestResult(tx.objectStore('projects').get(run.projectId));if(project?.revision!==run.graphRevision)throw Error('project_revision_conflict');if(project.trashedAt!=null||project.archived)throw Error('project_not_runnable');
   const row:UploadJournal|undefined=await requestResult(tx.objectStore('receipts').get(id));
   if(row?.state==='succeeded'&&row.mapping&&row.mapping.expiresAt>Date.now()+5000)return {...row.mapping,assetId:asset.id};
   if(row&&row.state!=='succeeded')throw Error('asset_upload_outcome_unknown');
   tx.objectStore('receipts').put({id,owner,state:'pending',runId:run.id,assetId:asset.id});return undefined;
  });
  if(prior)return prior;
  let mapping:CoreAssetRef|undefined,code='asset_upload_protocol_unknown',notSent=false;
  try{
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
   const reply=await client.requestJson('POST','/v1/assets',{filename:asset.sha256+'.'+supported.get(asset.mimeType),mime_type:asset.mimeType,data_base64:btoa(binary)});
   if(!reply.ok){code=reply.error.errorCode;notSent=reply.error.submissionOutcome==='not_sent';}
   else{
    const parsed=responseSchema.safeParse(reply.value);
    if(parsed.success){const v=parsed.data;if(v.sha256===asset.sha256&&v.bytes===asset.bytes&&v.mime_type===asset.mimeType&&v.expires_at*1000>Date.now()+5000&&v.expires_at>v.created_at&&Number.isSafeInteger(v.expires_at*1000)&&v.created_at*1000<=Date.now()+60000)mapping={...binding,assetId:asset.id,sha256:asset.sha256,coreAssetId:v.id,createdAt:v.created_at*1000,expiresAt:v.expires_at*1000};}
   }
  }catch{code='asset_upload_outcome_unknown';}
  // A response may arrive after writer loss: retain the known remote identity, but
  // preparing/finalizing still needs the project and preparation fences.
  await transact(db,['receipts'],'readwrite',async tx=>{const row:UploadJournal|undefined=await requestResult(tx.objectStore('receipts').get(id));if(row?.owner!==owner)throw Error('asset_upload_journal_conflict');if(notSent)tx.objectStore('receipts').delete(id);else tx.objectStore('receipts').put({...row,state:mapping?'succeeded':'response_unknown',...(mapping?{mapping}:{})});});
  if(!mapping)throw Error(code);return mapping;
 });
}
