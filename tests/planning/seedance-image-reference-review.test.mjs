import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withReviewedImageReference} from '../../scripts/apply-seedance-image-reference-review.mjs';

test('single image registration preserves identities, video specs, targets and unrelated gates',async()=>{
 const review=JSON.parse(await readFile(new URL('../../deploy/seedance-image-reference-review.json',import.meta.url),'utf8'));
 const runtime={schemaVersion:1,host:'127.0.0.1',port:4188,connections:[{profile:{id:'fixture',name:'fixture',originSnapshot:'https://api.gemstory.cn',proxyBase:'/core-api',contractVersion:'fixture-v1'},contract:{version:'fixture-v1',verification:'reviewed',evidence:[],videoModels:['seedance'],videoSpecs:[{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,assets:false,continuation:false,workContext:false},limits:{promptBytes:12288,imageReferences:0,videoReferences:0}}}],coreTargets:[{proxyBase:'/core-api',origin:'https://api.gemstory.cn',allowWrites:false}]};
 const before=structuredClone(runtime),result=withReviewedImageReference(runtime,review);
 assert.deepEqual(runtime,before);assert.deepEqual(result.connections[0].profile,before.connections[0].profile);assert.deepEqual(result.coreTargets,before.coreTargets);assert.deepEqual(result.connections[0].contract.videoSpecs,before.connections[0].contract.videoSpecs);
 assert.equal(result.connections[0].contract.routes.assets,true);assert.equal(result.connections[0].contract.routes.continuation,false);assert.equal(result.connections[0].contract.routes.workContext,false);assert.deepEqual(result.connections[0].contract.limits,{promptBytes:12288,assetBytes:33554432,imageReferences:1,videoReferences:0});
 assert.deepEqual(withReviewedImageReference(result,review),result);
 for(const patch of [{verification:'unknown'},{imageReferences:10},{route:'/admin/assets'}])assert.throws(()=>withReviewedImageReference(runtime,{...review,...patch}),/image_reference_review_required/);
 const invalid=structuredClone(runtime);invalid.connections[0].contract.routes.videoSubmit=false;assert.throws(()=>withReviewedImageReference(invalid,review),/existing_video_contract_required/);
});
