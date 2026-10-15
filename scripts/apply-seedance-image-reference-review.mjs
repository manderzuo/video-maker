import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRuntime} from './serve-local.mjs';
import {reviewedImageContract} from './seedance-image-contract.mjs';
export {reviewedImageContract} from './seedance-image-contract.mjs';

export function withReviewedImageReference(runtime,review){
 const result=validateRuntime(runtime),entry=result.connections.find(e=>e.profile.originSnapshot==='https://api.gemstory.cn');
 if(!entry)throw Error('existing_video_contract_required');
 entry.contract=reviewedImageContract(entry.contract,review);entry.profile.contractVersion=entry.contract.version;
 return result;
}
export function withReviewedCloudImageReference(runtime,review){
 const result=structuredClone(runtime);
 const entries=result.videoContracts?.filter(e=>new URL(e.apiBase).origin==='https://api.gemstory.cn');
 if(entries?.length!==1)throw Error('existing_video_contract_required');
 entries[0].contract=reviewedImageContract(entries[0].contract,review);return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [runtimePath,coreRepository,nativeRepository]=process.argv.slice(2);if(!runtimePath||!coreRepository||!nativeRepository)throw Error('usage: runtime-json core-repository native-repository');
 const review=JSON.parse(await readFile(new URL('../deploy/seedance-image-reference-review.json',import.meta.url),'utf8'));
 for(const [repository,commit,prefix,files] of [[coreRepository,review.sourceCommit,'starlink-dimension-router/src/',review.sources],[nativeRepository,review.nativeSourceCommit,'src-tauri/src/api_server/',review.nativeSources]])for(const [file,hash] of Object.entries(files)){const bytes=execFileSync('git',['show',commit+':'+prefix+file],{cwd:repository,windowsHide:true});if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('source_hash_mismatch');}
 const runtime=JSON.parse((await readFile(runtimePath,'utf8')).replace(/^\uFEFF/,'')),result=Array.isArray(runtime.videoContracts)?withReviewedCloudImageReference(runtime,review):withReviewedImageReference(runtime,review),encoded=JSON.stringify(result);
 if(Buffer.byteLength(encoded)>65536)throw Error('deployment_inventory_too_large');
 await writeFile(runtimePath,encoded+'\n','utf8');console.log(`Up to ${review.imageReferences} source-reviewed image references registered; original configuration and other capability gates preserved.`);
}
