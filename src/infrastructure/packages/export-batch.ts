import {exportProject,type ExportOptions} from './export-project';
import {createPackageZip,encodeJson,packageLimits} from './package-limits';
import {hashBlob} from '../../features/assets/hash-worker';
import {id} from '../../domain/common';
export async function exportProjectBatch(projectIds:string[],options:ExportOptions){
 if(!projectIds.length||projectIds.length>50||new Set(projectIds).size!==projectIds.length||projectIds.some(value=>!id.safeParse(value).success))throw Error('batch_export_selection_invalid');
 const entries:Record<string,Uint8Array>={},projects:{id:string;path:string;bytes:number;sha256:string}[]=[];let total=0;
 // Every child is an independently importable versioned project package.
 // No partial download is triggered if a later selected project fails.
 for(const [index,projectId]of projectIds.entries()){
  const result=await exportProject(projectId,options);total+=result.bytes;if(total>packageLimits.expandedBytes)throw Error('package_too_large');
  const path=`projects/${index+1}.${options.mode==='structure'?'json':'zip'}`;entries[path]=new Uint8Array(await result.blob.arrayBuffer());projects.push({id:projectId,path,bytes:result.bytes,sha256:await hashBlob(result.blob)});
 }
 entries['manifest.json']=encodeJson({format:'aiwork-studio-project-batch',version:1,mode:options.mode,createdAt:Date.now(),projects});
 const blob=createPackageZip(entries);return {blob,filename:'AI-WORK-Studio-projects.zip',projects,bytes:blob.size};
}
