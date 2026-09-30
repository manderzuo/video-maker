import type {Project} from '../../domain/project';
import type {Graph} from '../../domain/graph';
import type {Run} from '../../domain/run';
import type {StudioDb} from './database';
import type {SaveResult} from '../../domain/common';
import {validateProject,validateGraph} from '../../domain/validation';
import {transact,requestResult,withDatabase,storageErrorCode} from './database';
import {validateFrozenBody,putRunInTransaction} from './run-repository';
export type SaveOptions={db?:StudioDb;graph?:Graph;runs?:Run[]};
export async function saveProject(project:Project,expectedRevision:number,options:SaveOptions={}):Promise<SaveResult>{
 const valid=validateProject(project);
 if(!valid.ok)return {status:'failed',code:valid.issues[0].code==='schema_too_new'?'schema_too_new':'project_invalid'};
 const input=structuredClone(valid.value),graphInput=options.graph?structuredClone(options.graph):undefined,runs=structuredClone(options.runs??[]);
 if(graphInput&&(!validateGraph(graphInput).ok||graphInput.projectId!==input.id||graphInput.revision!==input.revision))return {status:'failed',code:'graph_revision_or_schema_invalid'};
 try{
  for(const run of runs){if(run.projectId!==input.id)throw new Error('run_project_mismatch');await validateFrozenBody(run);}
  return await withDatabase(options.db,db=>transact(db,['projects','graphs','references','runs','diagnostics'],'readwrite',async tx=>{
   const previous:unknown=await requestResult(tx.objectStore('projects').get(input.id));
   if(previous!==undefined){const check=validateProject(previous);if(!check.ok)throw new Error('stored_project_not_writable');if(check.value.revision!==expectedRevision)return {status:'conflict',currentRevision:check.value.revision};}
   else if(expectedRevision!==0)return {status:'conflict',currentRevision:0};
   if(input.revision!==expectedRevision+1)return {status:'failed',code:'revision_increment_required'};
   const currentGraph:Graph|undefined=await requestResult(tx.objectStore('graphs').get(input.id));
   const graph=graphInput??{...(currentGraph??{projectId:input.id,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}}),revision:input.revision};
   if(!validateGraph(graph).ok)throw new Error('stored_graph_not_writable');
   tx.objectStore('projects').put(input);tx.objectStore('graphs').put(graph);
   const refs=tx.objectStore('references');
   const oldKeys=await requestResult(refs.index('projectId').getAllKeys(input.id));for(const key of oldKeys)refs.delete(key);
   const ids=new Set<string>();for(const node of graph.nodes){if(node.type==='asset'||node.type==='result')ids.add(node.data.assetId);if(node.type==='text')for(const ref of node.data.referenceTokens)if(ref.assetId)ids.add(ref.assetId);}
   for(const assetId of ids)refs.put({id:`${input.id}:${assetId}`,projectId:input.id,assetId,revision:input.revision});
   for(const run of runs)await putRunInTransaction(tx,run);
   tx.objectStore('diagnostics').put({id:crypto.randomUUID(),kind:'project_saved',projectId:input.id,revision:input.revision,at:Date.now()});
   return {status:'saved',revision:input.revision};
  }));
 }catch(error){return {status:'failed',code:storageErrorCode(error)};}
}
export async function readProject(id:string,db?:StudioDb):Promise<Project|undefined>{return withDatabase(db,c=>transact(c,['projects'],'readonly',async tx=>{const value:unknown=await requestResult(tx.objectStore('projects').get(id));if(value===undefined)return undefined;const checked=validateProject(value);if(!checked.ok)throw new Error('stored_project_not_writable');return checked.value;}));}
export async function readGraph(id:string,db?:StudioDb):Promise<Graph|undefined>{return withDatabase(db,c=>transact(c,['graphs'],'readonly',async tx=>{const value:unknown=await requestResult(tx.objectStore('graphs').get(id));if(value===undefined)return undefined;const checked=validateGraph(value);if(!checked.ok)throw new Error('stored_graph_not_writable');return checked.value;}));}
export class ProjectSaveSession{
 private savedSnapshot:string|null=null;
 state:'dirty'|'saving'|'saved'|'failed'='dirty';
 constructor(public draft:Project){}
 canSubmit(){return this.state==='saved'&&this.savedSnapshot===JSON.stringify(this.draft);}
 async save(expectedRevision:number,options:SaveOptions={}){
  this.state='saving';const snapshot=structuredClone(this.draft);
  const result=await saveProject(snapshot,expectedRevision,options);
  if(result.status==='saved'){this.savedSnapshot=JSON.stringify(snapshot);this.state=JSON.stringify(this.draft)===this.savedSnapshot?'saved':'dirty';}else this.state='failed';
  return result;
 }
}
