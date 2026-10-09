import type {WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {cloudProjectPackageSchema,packageMediaPath,type CloudProjectPackage} from '../../domain/cloud-project-package';
import {createPackageZip,readPackageZip,decodeJson,encodeJson,packageLimits} from '../../infrastructure/packages/package-limits';
import {detectMediaMime} from '../assets/media-probe';
import {ApiError} from '../../infrastructure/api/client';
export type CloudImportPlan={data:CloudProjectPackage;files:Map<string,Blob>;mapping:Record<string,string>;pending:Map<string,string>;idempotencyKey:string};
const hash=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
function media(data:CloudProjectPackage){return data.assets.flatMap(({asset,thumbnail})=>[{assetId:asset.id,variant:'original' as const,bytes:asset.bytes,sha256:asset.sha256,mimeType:asset.mimeType},...(thumbnail?[{assetId:asset.id,variant:'thumbnail' as const,...thumbnail}]:[])]);}
async function verified(blob:Blob,manifest:{bytes:number;sha256:string;mimeType:string}){
 if(blob.size!==manifest.bytes||await hash(blob)!==manifest.sha256||detectMediaMime(new Uint8Array(await blob.slice(0,128).arrayBuffer()))!==manifest.mimeType)throw new Error('package_invalid');
}
export async function exportCloudProject(api:Pick<WorkspaceClient,'exportProject'|'downloadAsset'>,id:string){
 const data=cloudProjectPackageSchema.parse(await api.exportProject(id)),entries:Record<string,Uint8Array>={'project.json':encodeJson(data)};
 const files=media(data);if(files.reduce((sum,file)=>sum+file.bytes,entries['project.json'].length)>packageLimits.expandedBytes||entries['project.json'].length>packageLimits.jsonBytes)throw new Error('package_too_large');
 for(const file of files){
  const path=packageMediaPath(file.sha256,file.variant);if(entries[path])continue;
  const blob=await api.downloadAsset(file.assetId,file.variant,file.bytes);await verified(blob,file);entries[path]=new Uint8Array(await blob.arrayBuffer());
 }
 return {blob:createPackageZip(entries),filename:data.project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'-cloud.zip'};
}
export async function inspectCloudProject(file:Blob):Promise<CloudImportPlan>{
 const entries=await readPackageZip(file),data=cloudProjectPackageSchema.parse(decodeJson(entries['project.json'])),files=new Map<string,Blob>();
 const manifests=media(data),allowed=new Set(['project.json',...manifests.map(item=>packageMediaPath(item.sha256,item.variant))]);
 if(Object.keys(entries).some(path=>!allowed.has(path)))throw new Error('package_invalid');
 for(const manifest of manifests){
  const path=packageMediaPath(manifest.sha256,manifest.variant),bytes=entries[path];if(!bytes)throw new Error('package_incomplete');
  const blob=new Blob([new Uint8Array(bytes).buffer],{type:manifest.mimeType});await verified(blob,manifest);files.set(path,blob);
 }
 return {data,files,mapping:{},pending:new Map(),idempotencyKey:crypto.randomUUID()};
}
export async function importCloudProject(api:Pick<WorkspaceClient,'reserveAsset'|'uploadFile'|'completeAsset'|'importProject'>,plan:CloudImportPlan){
 for(const {asset,thumbnail} of plan.data.assets){
  if(plan.mapping[asset.id])continue;
  let pending=plan.pending.get(asset.id);
  if(!pending){
   const saved=await api.reserveAsset({title:asset.title,...(asset.description!==undefined?{description:asset.description}:{}),...(asset.tags?{tags:asset.tags}:{}),mimeType:asset.mimeType,bytes:asset.bytes,sha256:asset.sha256,...(asset.width?{width:asset.width}:{}),...(asset.height?{height:asset.height}:{}),...(asset.durationSeconds!==undefined?{durationSeconds:asset.durationSeconds}:{}),...(thumbnail?{thumbnail}:{})});
   if(!('state' in saved)){plan.mapping[asset.id]=saved.id;continue;}
   pending=saved.id;plan.pending.set(asset.id,pending);
  }
  try{
   await api.uploadFile(pending,plan.files.get(packageMediaPath(asset.sha256,'original'))!);
   if(thumbnail)await api.uploadFile(pending,plan.files.get(packageMediaPath(thumbnail.sha256,'thumbnail'))!,'thumbnail');
   plan.mapping[asset.id]=(await api.completeAsset(pending)).id;plan.pending.delete(asset.id);
  }catch(error){if(error instanceof ApiError&&['NOT_FOUND','ASSET_ALREADY_COMPLETE'].includes(error.code))plan.pending.delete(asset.id);throw error;}
 }
 return api.importProject(plan.data,{...plan.mapping},plan.idempotencyKey);
}
