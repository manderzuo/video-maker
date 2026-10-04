import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRuntime} from './serve-local.mjs';

export function withReviewedImageReference(runtime,review){
 if(review.verification!=='reviewed'||review.sourceCommit!=='345670bb3c4e6eb673afcb412e7a1dbd17eeffae'||review.route!=='/v1/assets'||review.scope!=='assets:write'||review.requestField!=='image_asset_ids'||review.assetBytes!==33554432||review.imageReferences!==1||review.videoReferences!==0)throw Error('image_reference_review_required');
 const result=validateRuntime(runtime),entry=result.connections.find(e=>e.profile.originSnapshot==='https://api.gemstory.cn');
 if(!entry||entry.contract.verification==='unknown'||!entry.contract.routes.videoSubmit||!entry.contract.routes.videoQuery||!entry.contract.routes.videoContent||JSON.stringify(entry.contract.videoModels)!=='["seedance"]')throw Error('existing_video_contract_required');
 entry.contract.routes.assets=true;
 entry.contract.limits={...entry.contract.limits,assetBytes:review.assetBytes,imageReferences:review.imageReferences,videoReferences:review.videoReferences};
 entry.contract.verification='reviewed';
 const reference=`deploy/seedance-image-reference-review.json; Core@${review.sourceCommit}; assets.rs SHA256 ${review.sources['assets.rs']}; user_routes.rs SHA256 ${review.sources['user_routes.rs']}; one image via owned image_asset_ids; fixed source review, not a live generation receipt.`;
 if(!entry.contract.evidence.some(e=>e.kind==='deployment_review'&&e.reference===reference))entry.contract.evidence.push({kind:'deployment_review',reference});
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [runtimePath,sourceDirectory]=process.argv.slice(2);if(!runtimePath||!sourceDirectory)throw Error('usage: runtime-json fixed-core-src-directory');
 const review=JSON.parse(await readFile(new URL('../deploy/seedance-image-reference-review.json',import.meta.url),'utf8'));
 for(const [file,hash] of Object.entries(review.sources)){const bytes=await readFile(resolve(sourceDirectory,file));if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('source_hash_mismatch');}
 const runtime=JSON.parse((await readFile(runtimePath,'utf8')).replace(/^\uFEFF/,'')),result=withReviewedImageReference(runtime,review),encoded=JSON.stringify(result);
 if(Buffer.byteLength(encoded)>65536)throw Error('deployment_inventory_too_large');
 await writeFile(runtimePath,encoded,'utf8');console.log('One source-reviewed image reference registered; service identity, targets and write policy preserved.');
}
