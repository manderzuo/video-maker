import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRuntime} from './serve-local.mjs';

export function withReviewedSeedanceSpecs(runtime,review){
 const result=validateRuntime(runtime);
 if(review.verification!=='reviewed'||review.sourceCommit!=='345670bb3c4e6eb673afcb412e7a1dbd17eeffae')throw Error('source_review_required');
 const entry=result.connections.find(e=>e.profile.originSnapshot==='https://api.gemstory.cn');
 if(!entry||!entry.contract.routes.videoSubmit||!entry.contract.routes.videoQuery||!entry.contract.routes.videoContent||JSON.stringify(entry.contract.videoModels)!=='["seedance"]')throw Error('existing_video_contract_required');
 entry.contract.verification='reviewed';
 const live=review.liveVerifiedSpec;
 const all=review.durationSeconds.flatMap(durationSeconds=>review.ratios.flatMap(ratio=>review.resolutions.map(resolution=>({modelId:'seedance',durationSeconds,ratio,resolution}))));
 // Keep the already used default first. All UI choices still remain editable.
 entry.contract.videoSpecs=[live,...all.filter(s=>JSON.stringify(s)!==JSON.stringify(live))];
 const reference=`deploy/seedance-spec-review.json; Core@${review.sourceCommit}; user_routes.rs SHA256 ${review.sourceSha256}; 336 input tuples source-reviewed; ONLY 5s/16:9/480p live verified. Existing contract identity retained for original task bindings.`;
 if(!entry.contract.evidence.some(e=>e.kind==='deployment_review'&&e.reference===reference))entry.contract.evidence.push({kind:'deployment_review',reference});
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [runtimePath,sourcePath]=process.argv.slice(2);if(!runtimePath||!sourcePath)throw Error('usage: runtime-json reviewed-user_routes.rs');
 const review=JSON.parse(await readFile(new URL('../deploy/seedance-spec-review.json',import.meta.url),'utf8'));
 const source=await readFile(sourcePath);if(createHash('sha256').update(source).digest('hex')!==review.sourceSha256)throw Error('source_hash_mismatch');
 const runtime=JSON.parse((await readFile(runtimePath,'utf8')).replace(/^\uFEFF/,'')),result=withReviewedSeedanceSpecs(runtime,review),encoded=JSON.stringify(result);
 if(Buffer.byteLength(encoded)>65536)throw Error('deployment_inventory_too_large');
 await writeFile(runtimePath,encoded,'utf8');console.log('336 source-reviewed video tuples saved; targets, authorization and routes retained.');
}
