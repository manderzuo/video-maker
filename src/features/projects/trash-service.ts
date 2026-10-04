import {readProject,saveProject} from '../../infrastructure/storage/project-repository';
import {projectSchema} from '../../domain/project';
import {assetSchema} from '../../domain/asset';
import {withDatabase,transact,requestResult,storageErrorCode} from '../../infrastructure/storage/database';
import {deleteLocalResource,type DeleteTarget,type DeletionConfirmation,type DeleteOptions,type DeleteResult} from './delete-policy';
export async function listTrashedProjects(options:DeleteOptions={}){
 return withDatabase(options.db,db=>transact(db,['projects'],'readonly',async tx=>(await requestResult<unknown[]>(tx.objectStore('projects').getAll())).map(p=>projectSchema.parse(p)).filter(p=>p.trashedAt!==null)));
}
export async function listTrashedAssets(options:DeleteOptions={}){
 return withDatabase(options.db,db=>transact(db,['assets'],'readonly',async tx=>(await requestResult<unknown[]>(tx.objectStore('assets').getAll())).map(a=>assetSchema.parse(a)).filter(a=>a.trashedAt!=null)));
}
export async function restoreAsset(id:string,expectedTrashedAt:number,options:DeleteOptions={}):Promise<DeleteResult>{
 try{return await withDatabase(options.db,db=>transact(db,['assets'],'readwrite',async tx=>{
  const row=await requestResult(tx.objectStore('assets').get(id));
  if(!row)return {success:false,id,errorCode:'resource_not_found'};
  const asset=assetSchema.parse(row);
  if(asset.trashedAt==null||asset.trashedAt!==expectedTrashedAt)return {success:false,id,errorCode:'asset_trash_conflict'};
  tx.objectStore('assets').put({...asset,trashedAt:null});
  return {success:true,id};
 }));}catch(error){return {success:false,id,errorCode:storageErrorCode(error)};}
}
export async function restoreProject(id:string,options:DeleteOptions):Promise<DeleteResult>{
 const project=await readProject(id,options.db);
 if(!project)return {success:false,id,errorCode:'resource_not_found'};
 if(project.revision!==options.expectedRevision)return {success:false,id,errorCode:'project_revision_conflict'};
 const result=await saveProject({...project,trashedAt:null,revision:project.revision+1,updatedAt:Date.now()},project.revision,{db:options.db,lease:options.lease});
 return result.status==='saved'?{success:true,id,revision:result.revision}:{success:false,id,errorCode:result.status==='conflict'?'project_revision_conflict':result.code};
}
export async function deleteBatch(items:{target:DeleteTarget;confirmation:DeletionConfirmation;options?:DeleteOptions}[],defaults:DeleteOptions={}):Promise<{results:DeleteResult[];succeeded:number;failed:number}>{
 const results:DeleteResult[]=[];
 for(const item of items)results.push(await deleteLocalResource(item.target,item.confirmation,{...defaults,...item.options}));
 return {results,succeeded:results.filter(r=>r.success).length,failed:results.filter(r=>!r.success).length};
}
