import {assetSchema,type Asset} from '../../domain/asset';
import {withDatabase,transact,requestResult,storageErrorCode,type StudioDb} from '../../infrastructure/storage/database';
import {assertProjectWriter,type ProjectLeaseToken} from '../../infrastructure/storage/project-lease';
import {projectSchema} from '../../domain/project';
import {hashBlob} from './hash-worker';
import {probeMedia} from './media-probe';
import {createThumbnail} from './thumbnail-service';
export type PreparedMedia={file:File;sha256:string;metadata:Awaited<ReturnType<typeof probeMedia>>;thumbnail:Blob|undefined};
export async function prepareMedia(file:File):Promise<PreparedMedia>{const metadata=await probeMedia(file),sha256=await hashBlob(file),thumbnail=await createThumbnail(file,metadata.mimeType);return {file,metadata,sha256,thumbnail};}
export type ImportReport={successes:{fileName:string;asset:Asset;deduplicated:boolean}[];failures:{fileName:string;errorCode:string}[];errorCode?:string};
export type ImportOptions={db?:StudioDb;lease?:ProjectLeaseToken;expectedRevision?:number};
export async function importAssets(files:File[],projectId?:string,options:ImportOptions={}):Promise<ImportReport>{
 const report:ImportReport={successes:[],failures:[]};
 if(files.length>50)return {...report,errorCode:'import_file_count_exceeded'};
 const lease=options.lease?{...options.lease}:undefined;
 return withDatabase(options.db,async db=>{
  for(const file of files){
   try{
    const {metadata,sha256,thumbnail}=await prepareMedia(file);
    const imported=await transact(db,['assets','blobs','references','projects','leases'],'readwrite',async tx=>{
     if(projectId){
      await assertProjectWriter(tx,projectId,lease);
      const project=projectSchema.parse(await requestResult(tx.objectStore('projects').get(projectId)));
      if(project.revision!==options.expectedRevision)throw new Error('project_revision_conflict');
     }
     const existing=await requestResult<Asset[]>(tx.objectStore('assets').getAll());
     const previous=existing.find(a=>a.sha256===sha256);
     const asset=previous??assetSchema.parse({id:crypto.randomUUID(),sha256,blobKey:'sha256:'+sha256,title:file.name,mediaType:metadata.mimeType.split('/')[0],...metadata,createdAt:Date.now()});
     if(!previous||!await requestResult(tx.objectStore('blobs').get(asset.blobKey))){
      // Blob and identity become visible together only after transaction completion.
      tx.objectStore('blobs').put({id:asset.blobKey,blob:file});
      if(thumbnail)tx.objectStore('blobs').put({id:'thumbnail:'+sha256,blob:thumbnail});
      if(!previous)tx.objectStore('assets').put(asset);
     }
     if(projectId)tx.objectStore('references').put({id:'import:'+projectId+':'+asset.id,projectId,assetId:asset.id,revision:options.expectedRevision,kind:'project-import'});
     return {asset,deduplicated:!!previous};
    });
    report.successes.push({fileName:file.name,...imported});
   }catch(error){report.failures.push({fileName:file.name,errorCode:storageErrorCode(error)});}
  }
  return report;
 });
}

