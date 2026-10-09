import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {resolveCapabilities,deploymentContractSchema} from '../../src/adapters/core/capabilities';

it('QA43 the gateway enables the reviewed input tuples without claiming every output was live verified',()=>{
 // 只读提交内的脱敏能力样本（合同形状与写入许可），不读被忽略的生产运行时文件。
 const sample=JSON.parse(readFileSync('tests/fixtures/gateway-contract.sample.json','utf8')) as {contract:unknown;allowWrites:boolean};
 const entry={contract:sample.contract};
 const contract=deploymentContractSchema.parse(entry.contract);
 const caps=resolveCapabilities(contract,[{id:'seedance'},{id:'deepseek-v4-flash'}]);
 expect(caps.videoModels).toEqual(['seedance']);
 const review=JSON.parse(readFileSync('deploy/seedance-spec-review.json','utf8'));
 const tuples=review.durationSeconds.flatMap((durationSeconds:number)=>review.ratios.flatMap((ratio:string)=>review.resolutions.map((resolution:string)=>({modelId:'seedance',durationSeconds,ratio,resolution}))));
 expect(caps.videoSpecs).toHaveLength(336);expect(new Set(caps.videoSpecs.map(s=>JSON.stringify(s)))).toEqual(new Set(tuples.map((s:unknown)=>JSON.stringify(s))));
 expect(caps.verification).toBe('reviewed');expect(review.liveVerifiedSpec).toEqual({modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'});
 expect(contract.evidence.some(e=>e.kind==='deployment_review'&&e.reference.includes(review.sourceSha256))).toBe(true);
 expect(contract.evidence.some(e=>e.kind==='live_probe')).toBe(true);
 expect(caps.textModels).toEqual([]);
 expect([caps.workContext,caps.continuation,caps.imageGeneration,caps.audioGeneration,caps.cancelVideo,caps.videoIdempotencyReplay]).toEqual([false,false,false,false,false,false]);
 expect(caps.limits).toMatchObject({promptBytes:12288,assetBytes:33554432,imageReferences:1,videoReferences:0});
 expect(contract.routes.assets).toBe(true);
 expect(contract.evidence.some(e=>e.kind==='deployment_review'&&e.reference.includes('cc2d99038f37fe7775da358acef9f33bdc97e6ab0368ff31d559828fcdaea202'))).toBe(true);
 expect(sample.allowWrites).toBe(true);
 expect(resolveCapabilities(contract,[{id:'unrelated'}]).videoModels).toEqual([]);
});
