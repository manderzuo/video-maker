import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withReviewedSeedanceSpecs} from '../../scripts/apply-seedance-spec-review.mjs';

test('reviewed Seedance parameter inventory records source review separately from one live generated specification',async()=>{
 const review=JSON.parse(await readFile(new URL('../../deploy/seedance-spec-review.json',import.meta.url),'utf8'));
 assert.equal(review.verification,'reviewed');assert.equal(review.sourceCommit,'345670bb3c4e6eb673afcb412e7a1dbd17eeffae');
 assert.deepEqual(review.durationSeconds,Array.from({length:14},(_,i)=>i+2));assert.deepEqual(review.ratios,['16:9','9:16','1:1','4:3','3:4','21:9']);assert.deepEqual(review.resolutions,['480p','720p','1080p','4k']);
 assert.deepEqual(review.liveVerifiedSpec,{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'});
 const specs=review.durationSeconds.flatMap(durationSeconds=>review.ratios.flatMap(ratio=>review.resolutions.map(resolution=>({modelId:review.modelId,durationSeconds,ratio,resolution}))));
 assert.equal(specs.length,336);assert.equal(Buffer.byteLength(JSON.stringify(specs))<55000,true);
});

test('parameter registration preserves original routes, service identity and write policy and refuses an unverified gateway',async()=>{
 const review=JSON.parse(await readFile(new URL('../../deploy/seedance-spec-review.json',import.meta.url),'utf8'));
 const runtime={schemaVersion:1,host:'127.0.0.1',port:4188,connections:[{profile:{id:'review-fixture',name:'review fixture',originSnapshot:'https://api.gemstory.cn',proxyBase:'/core-api',contractVersion:'review-fixture-v1'},contract:{version:'review-fixture-v1',verification:'live_verified',videoModels:['seedance'],videoSpecs:[review.liveVerifiedSpec],evidence:[{kind:'live_probe',reference:'fixture'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,assets:false},limits:{imageReferences:0,videoReferences:0}}}],coreTargets:[{proxyBase:'/core-api',origin:'https://api.gemstory.cn',allowWrites:false}]};
 const before=structuredClone(runtime),result=withReviewedSeedanceSpecs(runtime,review);
 assert.deepEqual(runtime,before);assert.deepEqual(result.coreTargets,before.coreTargets);assert.deepEqual(result.connections[0].profile,before.connections[0].profile);assert.deepEqual(result.connections[0].contract.routes,before.connections[0].contract.routes);assert.deepEqual(result.connections[0].contract.limits,before.connections[0].contract.limits);
 assert.deepEqual(result.connections[0].contract.videoSpecs[0],review.liveVerifiedSpec);assert.equal(result.connections[0].contract.verification,'reviewed');
 const unverified=structuredClone(runtime);unverified.connections[0].contract.routes.videoSubmit=false;assert.throws(()=>withReviewedSeedanceSpecs(unverified,review),/existing_video_contract_required/);
 assert.deepEqual(withReviewedSeedanceSpecs(result,review),result);
});
