import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withReviewedImageReference,withReviewedCloudImageReference} from '../../scripts/apply-seedance-image-reference-review.mjs';

test('multi-image registration supports nine references and preserves identities, video specs, targets and unrelated gates',async()=>{
 const review=JSON.parse(await readFile(new URL('../../deploy/seedance-image-reference-review.json',import.meta.url),'utf8'));
 const runtime={schemaVersion:1,host:'127.0.0.1',port:4188,connections:[{profile:{id:'fixture',name:'fixture',originSnapshot:'https://api.gemstory.cn',proxyBase:'/core-api',contractVersion:'fixture-v1'},contract:{version:'fixture-v1',verification:'reviewed',evidence:[],videoModels:['seedance'],videoSpecs:[{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,assets:false,continuation:false,workContext:false},limits:{promptBytes:12288,imageReferences:0,videoReferences:0}}}],coreTargets:[{proxyBase:'/core-api',origin:'https://api.gemstory.cn',allowWrites:false}]};
 const before=structuredClone(runtime),result=withReviewedImageReference(runtime,review);
 assert.deepEqual(runtime,before);assert.deepEqual(result.connections[0].profile,{...before.connections[0].profile,contractVersion:review.contractVersion});assert.deepEqual(result.coreTargets,before.coreTargets);assert.deepEqual(result.connections[0].contract.videoSpecs,before.connections[0].contract.videoSpecs);
 assert.equal(result.connections[0].contract.routes.assets,true);assert.equal(result.connections[0].contract.routes.continuation,false);assert.equal(result.connections[0].contract.routes.workContext,false);assert.deepEqual(result.connections[0].contract.limits,{promptBytes:12288,assetBytes:33554432,imageReferences:9,videoReferences:0});
 assert.deepEqual(withReviewedImageReference(result,review),result);
 for(const patch of [{verification:'unknown'},{imageReferences:3},{imageReferences:10},{route:'/admin/assets'}])assert.throws(()=>withReviewedImageReference(runtime,{...review,...patch}),/image_reference_review_required/);
 const invalid=structuredClone(runtime);invalid.connections[0].contract.routes.videoSubmit=false;assert.throws(()=>withReviewedImageReference(invalid,review),/existing_video_contract_required/);
 const cloud={origin:'https://studio.gemstory.cn',secretsFile:'/private/keyring.json',assets:{root:'/private/assets'},videoContracts:[{apiBase:'https://api.gemstory.cn',contract:{...before.connections[0].contract,routes:{...before.connections[0].contract.routes,videoRetry:true,workContext:true},limits:{...before.connections[0].contract.limits,videoReferences:1}}}]};
 const patched=withReviewedCloudImageReference(cloud,review);
 assert.deepEqual({...patched,videoContracts:[]},{...cloud,videoContracts:[]});assert.equal(patched.videoContracts[0].contract.limits.imageReferences,9);assert.equal(patched.videoContracts[0].contract.limits.videoReferences,1);assert.equal(patched.videoContracts[0].contract.routes.videoRetry,true);assert.equal(patched.videoContracts[0].contract.routes.workContext,true);assert.equal(cloud.videoContracts[0].contract.limits.imageReferences,0);
 assert.deepEqual(withReviewedCloudImageReference(patched,review),patched);
});
