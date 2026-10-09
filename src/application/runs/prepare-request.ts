import type {CoreClient} from '../../adapters/core/http-client';
import {uploadCoreAsset,validateUploadAsset,assertAssetBinding,type CoreAssetRef} from '../../adapters/core/assets';
import type {RunBinding} from '../../domain/common';
import type {CapabilityProfile} from '../../domain/connection';
import {transact,requestResult,withDatabase,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import type {ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {assetSchema} from '../../domain/asset';
import {readRun,putRunInTransaction,validateFrozenBody} from '../../infrastructure/storage/run-repository';
import {claimPreparation,assertPreparation,releasePreparation} from './preparation-lock';
import {fingerprintText} from './fingerprint';
import {videoRunSnapshotSchema,buildVideoRequestBody} from '../../domain/video-request';
export {videoRunSnapshotSchema,buildVideoRequestBody} from '../../domain/video-request';
export type {VideoRunSnapshot} from '../../domain/video-request';
export type PreparedVideoRequest={runId:string;binding:RunBinding;finalBody:string;bodyHash:string;idempotencyKey:string;assetMappings:CoreAssetRef[]};
export type PrepareOptions={client?:CoreClient;capability?:CapabilityProfile;db?:StudioDb;lease?:ProjectLeaseToken};
export async function prepareVideoRequest(runId:string,options:PrepareOptions={}):Promise<PreparedVideoRequest>{
 try{return await withDatabase(options.db,async db=>{
  const run=await readRun(runId,db);if(!run)throw Error('run_missing');
  const binding={connectionId:run.connectionId,authBindingId:run.authBindingId,originSnapshot:run.originSnapshot};
  if(options.client)assertAssetBinding(binding,options.client);
  const prepared=(finalBody:string,bodyHash:string,assetMappings:CoreAssetRef[]):PreparedVideoRequest=>({runId,binding,finalBody,bodyHash,idempotencyKey:run.idempotencyKey,assetMappings});
  if(run.finalBody!==undefined){await validateFrozenBody(run);const receipt=await transact(db,['receipts'],'readonly',tx=>requestResult<{assetMappings:CoreAssetRef[]}|undefined>(tx.objectStore('receipts').get(`prepared:${runId}`)));return prepared(run.finalBody,run.finalBodyHash!,receipt?.assetMappings??[]);}
  if(!['persisted','uploading'].includes(run.executionState))throw Error('run_request_unavailable');
  const client=options.client,cap=options.capability;if(!client||!cap||cap.verification==='unknown'||cap.contractVersion!==client.profile.contractVersion)throw Error('core_capability_unverified');
  const input=videoRunSnapshotSchema.parse(run.inputSnapshot),spec=input.spec;
  if(!cap.videoModels.includes(spec.modelId)&&!cap.videoAliases.includes(spec.modelId)||!spec.durationSeconds||!Number.isInteger(spec.durationSeconds)||!spec.ratio||!cap.videoSpecs.some(s=>s.modelId===spec.modelId&&s.durationSeconds===spec.durationSeconds&&s.ratio===spec.ratio&&s.resolution===spec.resolution))throw Error('video_spec_unsupported');
  if(!cap.limits?.promptBytes||new TextEncoder().encode(input.prompt).byteLength>cap.limits.promptBytes)throw Error('prompt_limit_unverified_or_exceeded');
  for(const mediaType of ['image','video'] as const){const count=input.references.filter(r=>r.mediaType===mediaType).length,limit=cap.limits[mediaType==='image'?'imageReferences':'videoReferences'];if(count&&(limit===undefined||count>limit))throw Error('reference_limit_unverified_or_exceeded');}
  if(new Set(input.references.map(r=>r.assetId)).size!==input.references.length||new Set(input.references.map(r=>r.alias)).size!==input.references.length)throw Error('reference_identity_duplicate');
  const token=await claimPreparation(db,run,options.lease);
  try{
   const assets=await transact(db,['assets','blobs'],'readonly',async tx=>{const values=[];for(const ref of input.references){const value:unknown=await requestResult(tx.objectStore('assets').get(ref.assetId));if(!value)throw Error('reference_asset_missing');const asset=assetSchema.parse(value),row:{blob:Blob}|undefined=await requestResult(tx.objectStore('blobs').get(asset.blobKey));if(!row?.blob)throw Error('reference_blob_missing');if(asset.mediaType!==ref.mediaType)throw Error('reference_media_mismatch');if(ref.sha256!==undefined&&ref.sha256!==asset.sha256||ref.bytes!==undefined&&ref.bytes!==asset.bytes)throw Error('reference_identity_changed');values.push({asset,blob:row.blob});}return values;});
   // Validate every byte-bearing reference before the first upload.
   for(const value of assets)await validateUploadAsset(value.asset,value.blob,cap);
   const assetMappings:CoreAssetRef[]=[];
   for(const value of assets)assetMappings.push(await uploadCoreAsset({runId,...value,binding,client,capability:cap,db,lease:options.lease,preparation:token}));
   const finalBody=buildVideoRequestBody(input,assetMappings),bodyHash=await fingerprintText(finalBody);
   await transact(db,['projects','runs','leases','receipts'],'readwrite',async tx=>{
    await assertPreparation(tx,token);
    await putRunInTransaction(tx,{...run,executionState:'persisted',finalBody,finalBodyHash:bodyHash,updatedAt:Date.now()},{lease:options.lease,expectedProjectRevision:run.graphRevision});
    tx.objectStore('receipts').put({id:`prepared:${run.id}`,runId:run.id,assetMappings,bodyHash,createdAt:Date.now()});
   });return prepared(finalBody,bodyHash,assetMappings);
  }finally{await releasePreparation(db,token);}
 });}catch(error){throw Error(storageErrorCode(error));}
}
