import type {Project} from '../../domain/project';
import type {Asset} from '../../domain/asset';
import type {Graph} from '../../domain/graph';
import type {Run} from '../../domain/run';
import type {PromptDraft} from '../../domain/prompt';
import {projectSchema} from '../../domain/project';
import {graphSchema} from '../../domain/graph';
import {assetSchema} from '../../domain/asset';
import {runSchema} from '../../domain/run';
import {promptDraftSchema} from '../../domain/prompt';
import {requestResult} from '../../infrastructure/storage/database';
export type ResourceSnapshot={projects:Project[];graphs:Graph[];assets:Asset[];runs:Run[];drafts:PromptDraft[];links:{id:string;projectId:string;assetId:string;kind?:string}[];receipts:unknown[]};
export type AssetReference={kind:'graph'|'run'|'draft'|'attachment'|'receipt';id:string;projectId?:string};
export function snapshotAssetIds(input:unknown):Set<string>{
 const ids=new Set<string>(),seen=new Set<object>();
 function visit(value:unknown){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
  for(const [key,item]of Object.entries(value)){if(['assetId','resultAssetId'].includes(key)&&typeof item==='string')ids.add(item);else if(key==='assetIds'&&Array.isArray(item))for(const id of item)if(typeof id==='string')ids.add(id);else continue;visit(item);}
 }
 visit(input);return ids;
}
export function referencesFor(snapshot:ResourceSnapshot,assetId:string):AssetReference[]{
 const result:AssetReference[]=[];
 for(const graph of snapshot.graphs)if(snapshotAssetIds(graph.nodes).has(assetId))result.push({kind:'graph',id:graph.projectId,projectId:graph.projectId});
 for(const run of snapshot.runs)if(snapshotAssetIds(run).has(assetId))result.push({kind:'run',id:run.id,projectId:run.projectId});
 for(const draft of snapshot.drafts)if(snapshotAssetIds(draft.references).has(assetId))result.push({kind:'draft',id:draft.id,projectId:draft.sourceProjectId});
 // Graph references are recomputed; only explicit library attachments need their own row.
 for(const link of snapshot.links)if(link.assetId===assetId&&link.kind==='project-import')result.push({kind:'attachment',id:link.id,projectId:link.projectId});
 for(const [index,receipt]of snapshot.receipts.entries())if(snapshotAssetIds(receipt).has(assetId))result.push({kind:'receipt',id:String(index)});
 return result;
}
export async function loadResourceSnapshot(tx:IDBTransaction):Promise<ResourceSnapshot>{
 const read=(name:string)=>requestResult<unknown[]>(tx.objectStore(name).getAll());
 const [projects,graphs,assets,runs,drafts,links,receipts]=await Promise.all(['projects','graphs','assets','runs','promptDrafts','references','receipts'].map(read));
 return {projects:projects.map(p=>projectSchema.parse(p)),graphs:graphs.map(g=>graphSchema.parse(g)),assets:assets.map(a=>assetSchema.parse(a)),runs:runs.map(r=>runSchema.parse(r)),drafts:drafts.map(d=>promptDraftSchema.parse(d)),links:links.map(value=>{
  if(!value||typeof value!=='object'||!('id'in value)||!('assetId'in value)||!('projectId'in value))throw new Error('reference_scan_invalid');
  const record=value as Record<string,unknown>;if(typeof record.id!=='string'||typeof record.assetId!=='string'||typeof record.projectId!=='string')throw new Error('reference_scan_invalid');
  return {id:record.id,projectId:record.projectId,assetId:record.assetId,kind:typeof record.kind==='string'?record.kind:undefined};
 }),receipts};
}
