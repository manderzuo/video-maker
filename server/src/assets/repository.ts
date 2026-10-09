import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {assetSchema,thumbnailSchema,type AssetRow,type Upload} from './contracts.js';
import {verifyAssetFile,removePendingFiles,copyThumbnail,removeThumbnail,type AssetStorageOptions,type FileManifest} from './storage.js';
export async function ownedAsset(client:Pool|PoolClient,context:AuthContext,id:string,lock=false){
 const result=await client.query<AssetRow>('SELECT id,state,document,thumbnail FROM workspace_assets WHERE user_id=$1 AND id::text=$2'+(lock?' FOR UPDATE':''),[context.userId,id]);
 if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');return result.rows[0];
}
export function manifests(row:AssetRow){const asset=assetSchema.parse(row.document);return {asset,original:{bytes:asset.bytes,sha256:asset.sha256,mimeType:asset.mimeType},thumbnail:row.thumbnail?thumbnailSchema.parse(row.thumbnail):undefined};}
export async function reserveAsset(pool:Pool,context:AuthContext,input:Upload,options:AssetStorageOptions,now:Date){
 if(input.bytes>options.maxAssetBytes||(input.thumbnail?.bytes??0)>options.maxThumbnailBytes)throw new HttpError(400,'INVALID_REQUEST');
 return transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':asset-quota']);
  const duplicate=await client.query<AssetRow>("SELECT id,state,document,thumbnail FROM workspace_assets WHERE user_id=$1 AND sha256=$2 AND state='complete' AND trashed_at IS NULL",[context.userId,input.sha256]);
  if(duplicate.rows[0]){const stored=manifests(duplicate.rows[0]),asset=stored.asset;if(asset.bytes!==input.bytes||asset.mimeType!==input.mimeType)throw new HttpError(400,'INVALID_REQUEST');if(!input.thumbnail||stored.thumbnail?.sha256===input.thumbnail.sha256)return {duplicate:true,value:asset};}
  const used=await client.query<{bytes:string}>('SELECT COALESCE(SUM(reserved_bytes),0)::text AS bytes FROM workspace_assets WHERE user_id=$1',[context.userId]);
  const reserved=input.bytes+(input.thumbnail?.bytes??0);if(Number(used.rows[0]!.bytes)+reserved>options.userQuotaBytes)throw new HttpError(413,'USER_QUOTA_EXCEEDED');
  const id=randomUUID();const {thumbnail,...metadata}=input;
  const document=assetSchema.parse({...metadata,id,blobKey:'asset:'+id,mediaType:input.mimeType.split('/')[0],createdAt:now.getTime(),metadataRevision:0,trashedAt:null});
  await client.query("INSERT INTO workspace_assets(user_id,id,state,document,thumbnail,sha256,bytes,reserved_bytes,created_at) VALUES($1,$2,'pending',$3::jsonb,$4::jsonb,$5,$6,$7,$8)",[context.userId,id,JSON.stringify(document),thumbnail?JSON.stringify(thumbnail):null,input.sha256,input.bytes,reserved,now]);
  return {duplicate:false,value:{id,state:'pending' as const}};
 });
}
export async function listAssets(pool:Pool,context:AuthContext,trashed:boolean){const result=await pool.query<{document:unknown}>("SELECT document FROM workspace_assets WHERE user_id=$1 AND state='complete' AND "+(trashed?'trashed_at IS NOT NULL':'trashed_at IS NULL')+' ORDER BY created_at DESC,id',[context.userId]);return result.rows.map(row=>assetSchema.parse(row.document));}
export async function completeAsset(pool:Pool,context:AuthContext,id:string,options:AssetStorageOptions){
 let discarded=false,obsolete:{id:string;manifest:FileManifest}|undefined;
 const result=await transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':asset-quota']);
  const row=await ownedAsset(client,context,id,true),{asset,original,thumbnail}=manifests(row);if(row.state==='complete')return asset;
  await verifyAssetFile(options,context.userId,id,'original',original);if(thumbnail)await verifyAssetFile(options,context.userId,id,'thumbnail',thumbnail);
  const duplicate=await client.query<AssetRow>("SELECT id,state,document,thumbnail FROM workspace_assets WHERE user_id=$1 AND sha256=$2 AND state='complete' AND trashed_at IS NULL FOR UPDATE",[context.userId,asset.sha256]);
  if(duplicate.rows[0]){
   const stored=manifests(duplicate.rows[0]);let next=stored.asset;
   if(thumbnail&&stored.thumbnail?.sha256!==thumbnail.sha256){
    await copyThumbnail(options,context.userId,id,next.id,thumbnail);
    next={...next,metadataRevision:(next.metadataRevision??0)+1};
    await client.query('UPDATE workspace_assets SET thumbnail=$3::jsonb,reserved_bytes=bytes+$4,document=$5::jsonb WHERE user_id=$1 AND id=$2',[context.userId,next.id,JSON.stringify(thumbnail),thumbnail.bytes,JSON.stringify(next)]);
    if(stored.thumbnail)obsolete={id:next.id,manifest:stored.thumbnail};
   }
   await client.query("DELETE FROM workspace_assets WHERE user_id=$1 AND id=$2 AND state='pending'",[context.userId,id]);discarded=true;return next;
  }
  await client.query("UPDATE workspace_assets SET state='complete' WHERE user_id=$1 AND id=$2",[context.userId,id]);return asset;
 });
 // Only unpublished/obsolete files are removed after the database commits.
 if(discarded)await removePendingFiles(options,context.userId,id).catch(()=>{});
 if(obsolete){const old=obsolete;await transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':asset-quota']);
  const row=await ownedAsset(client,context,old.id,true);
  if(manifests(row).thumbnail?.sha256!==old.manifest.sha256)await removeThumbnail(options,context.userId,old.id,old.manifest);
 }).catch(()=>{});}
 return result;
}
export async function cancelUpload(pool:Pool,context:AuthContext,id:string,options:AssetStorageOptions){
 await transaction(pool,async client=>{
  const row=await ownedAsset(client,context,id,true);if(row.state!=='pending')throw new HttpError(409,'ASSET_ALREADY_COMPLETE');
  await client.query("DELETE FROM workspace_assets WHERE user_id=$1 AND id=$2 AND state='pending'",[context.userId,id]);await removePendingFiles(options,context.userId,id);
 });
}
export async function changeAsset(pool:Pool,context:AuthContext,id:string,expectedRevision:number,patch:Record<string,unknown>,action:'patch'|'trash'|'restore',now:Date){
 return transaction(pool,async client=>{
  const row=await ownedAsset(client,context,id,true),asset=assetSchema.parse(row.document);if(row.state!=='complete')throw new HttpError(404,'NOT_FOUND');
  if((asset.metadataRevision??0)!==expectedRevision)throw new HttpError(409,'REVISION_CONFLICT');
  if(action==='trash'){const refs=await client.query('SELECT 1 FROM workspace_asset_references WHERE user_id=$1 AND asset_id=$2 UNION ALL SELECT 1 FROM workspace_content_assets WHERE user_id=$1 AND asset_id=$2 LIMIT 1',[context.userId,id]);if(refs.rows.length)throw new HttpError(409,'ASSET_IN_USE');}
  const next=assetSchema.parse({...asset,...patch,metadataRevision:expectedRevision+1,...(action==='patch'?{}:{trashedAt:action==='trash'?now.getTime():null})});
  await client.query('UPDATE workspace_assets SET document=$3::jsonb,trashed_at=$4 WHERE user_id=$1 AND id=$2',[context.userId,id,JSON.stringify(next),next.trashedAt?new Date(next.trashedAt):null]);return next;
 });
}
