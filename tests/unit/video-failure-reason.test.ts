import {it,expect} from 'vitest';
import {parseVideoTask} from '../../src/adapters/core/contracts';
import {runSchema} from '../../src/domain/run';
import {f} from '../helpers/fixtures';
import {videoFailureMessage} from '../../src/domain/video-failure';
const semantic='input image content[1] may contain real person';
const error=(patch:Record<string,unknown>={})=>({code:'video_execution_failed',billing_state:'pending',message:'FAKE_PRIVATE_LOG_DO_NOT_STORE',upstream:{code:3003,message:semantic},...patch});
for(const wrapper of ['task','video_task','data'] as const){
 it(`F0: ${wrapper} preserves the safe image-rejection reason and billing without provider text`,()=>{
  const task={id:'failed-mock-1',status:'failed',error:error()};
  const parsed=parseVideoTask(wrapper==='data'?{data:{task}}:{[wrapper]:task});
  expect(parsed).toMatchObject({status:'failed',billingState:'pending_reconciliation',failure:{reasonCode:'video_reference_real_person_rejected',gatewayCode:'video_execution_failed',upstreamCode:'3003'}});
  expect(JSON.stringify(parsed)).not.toContain('FAKE_PRIVATE');expect(JSON.stringify(parsed)).not.toContain('input image');
 });
}
it.each([3003,'3003'])('F0: public upstream code %s is normalized',code=>{expect(parseVideoTask({task:{id:'t',status:'failed',error:error({upstream:{code,message:semantic}})}})).toMatchObject({failure:{upstreamCode:'3003'}});});
it('F0: outer gateway semantic can identify rejection without inventing an upstream number',()=>{const p=parseVideoTask({task:{id:'t',status:'failed',error:error({message:semantic,upstream:undefined})}});expect(p).toMatchObject({failure:{reasonCode:'video_reference_real_person_rejected'}});expect(JSON.stringify(p)).not.toContain('3003');});
it.each([{code:3003,message:'unrelated service error'},{code:3003,message:'real person requested'},{code:'Bearer FAKE_SECRET',message:semantic},{code:1.1,message:semantic}])('F0: unknown code/semantic does not fabricate rejection or expose codes (%j)',upstream=>{const p=parseVideoTask({task:{id:'t',status:'failed',error:error({upstream})}});expect(p).toHaveProperty('failure');expect(JSON.stringify(p)).not.toContain('FAKE_SECRET');if(!String(upstream.message).includes('input image'))expect(p).toMatchObject({failure:{reasonCode:'video_execution_failed'}});});
it.each([null,42,[],'<script>PRIVATE</script>'])('F0: malformed optional upstream never discards task state (%j)',upstream=>{const p=parseVideoTask({task:{id:'t',status:'failed',error:error({upstream})}});expect(p).toMatchObject({taskId:'t',status:'failed',billingState:'pending_reconciliation',failure:{reasonCode:'video_execution_failed'}});});
it('F0: overlong semantic is downgraded without exposing HTML/secret/stack text',()=>{const p=parseVideoTask({task:{id:'t',status:'failed',error:error({message:'Bearer FAKE_SECRET',upstream:{code:3003,message:semantic+'<script>PRIVATE</script>'.repeat(300)}})}});expect(p).toMatchObject({failure:{reasonCode:'video_execution_failed',upstreamCode:'3003'}});expect(JSON.stringify(p)).not.toMatch(/FAKE_SECRET|script|PRIVATE/);});
it('F0: generic gateway number from another service does not identify this reason',()=>{expect(parseVideoTask({task:{id:'t',status:'failed',error:error({code:'unrelated_gateway',upstream:{code:3003,message:semantic}})}})).toMatchObject({failure:{reasonCode:'video_failure_reason_unavailable'}});});
it.each(['queued','processing','completed'])('F0: %s task does not become a failure from supplemental text',status=>{expect(parseVideoTask({task:{id:'t',status,error:error()}})).not.toHaveProperty('failure');});
it('F0: reference rejection message keeps the provider uncertainty',()=>{expect(videoFailureMessage('video_reference_real_person_rejected')).toBe('生成失败：上游判定参考图片可能包含真人，拒绝生成。');});

it('F0: invalid optional numeric code does not erase a valid rejection semantic',()=>{const p=parseVideoTask({task:{id:'t',status:'failed',error:error({upstream:{code:null,message:semantic}})}});expect(p).toMatchObject({failure:{reasonCode:'video_reference_real_person_rejected'}});expect(JSON.stringify(p)).not.toContain('upstreamCode');});

it('F0: safe failure is validated and survives Run serialization while old runs remain readable',()=>{const failure={reasonCode:'video_reference_real_person_rejected',gatewayCode:'video_execution_failed',upstreamCode:'3003'};const raw={...f.run(),failure};expect(runSchema.parse(JSON.parse(JSON.stringify(raw)))).toMatchObject({failure});expect(runSchema.parse(f.run())).not.toHaveProperty('failure');expect(()=>runSchema.parse({...raw,failure:{...failure,message:'PRIVATE_RAW'}})).toThrow();});

it('F0: an internal reason label used as an upstream gateway code cannot bypass the semantic check',()=>{
 const parsed=parseVideoTask({task:{id:'t',status:'failed',error:{code:'video_reference_real_person_rejected',upstream:{code:3003,message:'unrelated failure'}}}});
 expect(parsed.failure).toEqual({reasonCode:'video_failure_reason_unavailable',upstreamCode:'3003'});
});

it.each([
 'input image was accepted; the requested output may contain real person',
 'input image is unrelated; prompt may contain real person',
 'not true that input image content[1] may contain real person',
 'input image content[1] may contain real person is not the rejection reason',
 'input image content[1] may contain real person? no image rejection occurred',
 'input image does not contain a real person',
 'input image content[1] may not contain real person'
])('F0 review: unrelated or negated clause stays generic (%s)',message=>{
 const parsed=parseVideoTask({task:{id:'t',status:'failed',error:error({upstream:{code:3003,message}})}});
 expect(parsed.failure).toEqual({reasonCode:'video_execution_failed',gatewayCode:'video_execution_failed',upstreamCode:'3003'});
});
it.each(['Input image may contain a real person.','input image content[0] may contain real person','INPUT IMAGE CONTENT[12] MAY CONTAIN REAL PERSON'])('F0 review: approved reference clause remains recognized (%s)',message=>{
 expect(parseVideoTask({task:{id:'t',status:'failed',error:error({upstream:{code:3003,message}})}}).failure?.reasonCode).toBe('video_reference_real_person_rejected');
});

it('F0 review: extra HTML or provider prose is not treated as an approved rejection clause',()=>{
 const parsed=parseVideoTask({task:{id:'t',status:'failed',error:error({upstream:{code:3003,message:semantic+' <b>FAKE_SECRET</b>'}})}});
 expect(parsed.failure?.reasonCode).toBe('video_execution_failed');expect(JSON.stringify(parsed)).not.toContain('FAKE_SECRET');
});
