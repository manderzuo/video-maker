import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {resolveCapabilities,deploymentContractSchema} from '../../src/adapters/core/capabilities';
import type {ConnectionProfile} from '../../src/domain/connection';

it('QA31 the validated local gateway registration enables only the actually verified video specification',()=>{
 const runtime=JSON.parse(readFileSync('deploy/local/gemstory-live-20261003.json','utf8').replace(/^\uFEFF/,''));
 const entry=runtime.connections.find((e:{profile:ConnectionProfile})=>e.profile.originSnapshot==='https://api.gemstory.cn');
 const contract=deploymentContractSchema.parse(entry.contract);
 const caps=resolveCapabilities(contract,[{id:'seedance'},{id:'deepseek-v4-flash'}]);
 expect(caps.videoModels).toEqual(['seedance']);
 expect(caps.videoSpecs).toEqual([{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}]);
 expect(caps.verification).toBe('live_verified');
 expect(contract.evidence.some(e=>e.kind==='live_probe')).toBe(true);
 expect(caps.textModels).toEqual([]);
 expect([caps.workContext,caps.continuation,caps.imageGeneration,caps.audioGeneration,caps.cancelVideo,caps.videoIdempotencyReplay]).toEqual([false,false,false,false,false,false]);
 expect(caps.limits).toMatchObject({promptBytes:12288,imageReferences:0,videoReferences:0});
 expect(runtime.coreTargets.find((t:{origin:string})=>t.origin==='https://api.gemstory.cn').allowWrites).toBe(true);
 expect(resolveCapabilities(contract,[{id:'unrelated'}]).videoModels).toEqual([]);
});
