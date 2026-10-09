import type {WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {cloudProjectPackageSchema,packageMediaPath,type CloudProjectPackage} from '../../domain/cloud-project-package';
import {graphSchema} from '../../domain/graph';
import {assetSchema} from '../../domain/asset';
import {projectSchema} from '../../domain/project';
import {createPackageZip,readPackageZip,decodeJson,encodeJson,packageLimits} from '../../infrastructure/packages/package-limits';
import {migrateLegacyPackage} from '../../infrastructure/packages/legacy-migration';
import {detectMediaMime} from '../assets/media-probe';
import {ApiError} from '../../infrastructure/api/client';
export type CloudImportPlan={data:CloudProjectPackage;files:Map<string,Blob>;mapping:Record<string,string>;pending:Map<string,string>;idempotencyKey:string;legacy?:{isolated:number}};
const cloudKnownTypes=new Set(['text','asset','video-generation','result','group']);
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
 const probe=await readPackageZip(file);
 if(!probe['project.json']&&probe['projects.json'])return inspectLegacyProject(file);
 const entries=probe,data=cloudProjectPackageSchema.parse(decodeJson(entries['project.json'])),files=new Map<string,Blob>();
 const manifests=media(data),allowed=new Set(['project.json',...manifests.map(item=>packageMediaPath(item.sha256,item.variant))]);
 if(Object.keys(entries).some(path=>!allowed.has(path)))throw new Error('package_invalid');
 for(const manifest of manifests){
  const path=packageMediaPath(manifest.sha256,manifest.variant),bytes=entries[path];if(!bytes)throw new Error('package_incomplete');
  const blob=new Blob([new Uint8Array(bytes).buffer],{type:manifest.mimeType});await verified(blob,manifest);files.set(path,blob);
 }
 return {data,files,mapping:{},pending:new Map(),idempotencyKey:crypto.randomUUID()};
}
// 旧离线包（infinite-canvas v3 projects.json）：用户明确选择文件后，在内存中
// 经 migrateLegacyPackage 转换为云端包再走同一校验与导入链。只读用户文件，
// 不碰匿名库；旧配置/会话/无类型连线不导入，不支持的旧节点隔离计数后丢弃。
export async function inspectLegacyProject(file:Blob):Promise<CloudImportPlan>{
 const raw=await readPackageZip(file);
 if(!raw['projects.json'])throw new Error('package_invalid');
 const entries=await migrateLegacyPackage(raw);
 const manifest=decodeJson(entries['manifest.json']) as {assets:({id:string;sha256:string;mediaType:string;mimeType:string;bytes:number;path:string} & Record<string,unknown>)[]};
 const graphJson=decodeJson(entries['graph.json']) as {nodes:{id:string;type:string}[]};
 const kept=(graphJson.nodes??[]).filter(node=>cloudKnownTypes.has(node.type));
 const isolated=(graphJson.nodes??[]).length-kept.length;
 const project=projectSchema.parse({...decodeJson(entries['project.json']) as Record<string,unknown>,starred:false});
 const graph=graphSchema.parse({...decodeJson(entries['graph.json']) as Record<string,unknown>,nodes:kept});
 const assets=manifest.assets.map(item=>{const {path:_,...rest}=item;void _;return {asset:assetSchema.parse({...rest,metadataRevision:0,trashedAt:null})};});
 const files=new Map<string,Blob>();
 for(const [index,{asset}] of assets.entries()){
  // 转换后 manifest 指向旧 `.bin` 路径；按该路径读取字节，向新 plan 写入
  // 云端 original 路径，内容 hash/MIME 检查保留。
  const legacyPath=manifest.assets[index].path,bytes=entries[legacyPath];
  if(!legacyPath||!bytes)throw new Error('package_incomplete');
  const blob=new Blob([new Uint8Array(bytes).buffer],{type:asset.mimeType});
  await verified(blob,asset);files.set(packageMediaPath(asset.sha256,'original'),blob);
 }
 const data=cloudProjectPackageSchema.parse({format:'aiwork-studio-cloud-project',version:1,createdAt:Date.now(),project,graph,assets:assets.map(({asset})=>({asset})),history:{receipts:[],undo:[],redo:[]}});
 return {data,files,mapping:{},pending:new Map(),idempotencyKey:crypto.randomUUID(),legacy:{isolated}};
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
