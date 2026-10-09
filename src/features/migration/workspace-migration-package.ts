import {workspaceMigrationSchema,migrationSelectionSchema,portableMigrationContent,type WorkspaceMigration,type MigrationSelection} from '../../domain/workspace-migration';
import {createPackageZip,readPackageZip,encodeJson,decodeJson,packageLimits} from '../../infrastructure/packages/package-limits';
import type {LegacySnapshot} from './legacy-reader';
export const migrationHash=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
export type WorkspaceMigrationPlan={data:WorkspaceMigration;files:Map<string,Blob>};
export async function exportLegacyWorkspace(snapshot:LegacySnapshot,selection:MigrationSelection){
 migrationSelectionSchema.parse(selection);const selected=new Set(selection.projectIds),projects=snapshot.projects.filter(row=>selected.has(row.id)&&(selection.includeTrash||row.trashedAt===null)).map(project=>{const graph=snapshot.graphs.find(row=>row.projectId===project.id);if(!graph)throw new Error('migration_project_incomplete');return {project,graph};});
 const records=snapshot.records.filter(record=>{const row=record.document as Record<string,unknown>,projectId=row.projectId??row.sourceProjectId;return (typeof projectId==='string'?selected.has(projectId):selection.includeStandalone)&&(selection.includeTrash||!row.trashed&&!row.trashedAt);});
 const ids=new Set<string>();function refs(input:unknown){if(!input||typeof input!=='object')return;for(const [key,value]of Object.entries(input)){if(['assetId','sourceAssetId','resultAssetId'].includes(key)&&typeof value==='string')ids.add(value);else refs(value);}}refs([projects,records]);
 const assets:WorkspaceMigration['assets']=[],entries:Record<string,Uint8Array>={};let total=0;
 for(const asset of snapshot.assets.filter(row=>ids.has(row.id)||selection.includeStandalone&&(selection.includeTrash||!row.trashedAt))){
  const original=snapshot.blobs.get(asset.blobKey);if(!original||original.size!==asset.bytes||await migrationHash(original)!==asset.sha256)throw new Error('migration_file_integrity');if(original.size>packageLimits.entryBytes||total+original.size>packageLimits.expandedBytes)throw new Error('package_too_large');
  const manifest={path:'media/'+asset.sha256+'.original',bytes:asset.bytes,sha256:asset.sha256,mimeType:asset.mimeType};if(!entries[manifest.path]){total+=original.size;entries[manifest.path]=new Uint8Array(await original.arrayBuffer());}
  const thumbnail=snapshot.blobs.get('thumbnail:'+asset.sha256);let thumb:WorkspaceMigration['assets'][number]['thumbnail'];
  if(thumbnail){if(thumbnail.size>packageLimits.entryBytes||total+thumbnail.size>packageLimits.expandedBytes)throw new Error('package_too_large');const sha256=await migrationHash(thumbnail);thumb={path:'media/'+sha256+'.thumbnail',bytes:thumbnail.size,sha256,mimeType:thumbnail.type||'image/png'};if(!entries[thumb.path]){total+=thumbnail.size;entries[thumb.path]=new Uint8Array(await thumbnail.arrayBuffer());}}
  if(total>packageLimits.expandedBytes)throw new Error('package_too_large');assets.push({asset:{...asset,blobKey:'sha256:'+asset.sha256},original:manifest,...(thumb?{thumbnail:thumb}:{})});
 }
 const data=workspaceMigrationSchema.parse(portableMigrationContent({format:'aiwork-workspace-migration',version:1,exportId:crypto.randomUUID(),createdAt:Date.now(),source:{database:'aiwork-studio:v1',schemaVersion:snapshot.version},selection,projects,assets,records,...(selection.includePreferences&&snapshot.preferences?{preferences:snapshot.preferences}:{})}));entries['workspace.json']=encodeJson(data);if(entries['workspace.json'].byteLength>packageLimits.jsonBytes)throw new Error('package_too_large');
 return {blob:createPackageZip(entries),data,filename:'aiwork-workspace-'+data.exportId+'.zip'};
}
export async function inspectWorkspaceMigration(file:Blob):Promise<WorkspaceMigrationPlan>{
 const entries=await readPackageZip(file),data=workspaceMigrationSchema.parse(decodeJson(entries['workspace.json'])),files=new Map<string,Blob>();
 const manifests=data.assets.flatMap(row=>[row.original,...(row.thumbnail?[row.thumbnail]:[])]),allowed=new Set(['workspace.json',...manifests.map(row=>row.path)]);if(Object.keys(entries).some(path=>!allowed.has(path)))throw new Error('migration_invalid');
 for(const row of manifests){const bytes=entries[row.path];if(!bytes)throw new Error('migration_file_integrity');const blob=new Blob([new Uint8Array(bytes).buffer],{type:row.mimeType});if(blob.size!==row.bytes||await migrationHash(blob)!==row.sha256)throw new Error('migration_file_integrity');files.set(row.path,blob);}
 return {data,files};
}
