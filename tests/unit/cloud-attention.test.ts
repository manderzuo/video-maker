import {expect,it} from 'vitest';
import type {CloudRun} from '../../src/domain/cloud-video-run';
import {attentionItems} from '../../src/features/workspace/cloud-attention';
const video=(overrides:Record<string,unknown>={})=>({id:'a0000000-0000-4000-8000-000000000001',kind:'video',projectId:'b0000000-0000-4000-8000-000000000002',nodeId:'c0000000-0000-4000-8000-000000000003',executionState:'succeeded',queryState:'idle',deliveryState:'none',billingState:'settled',createdAt:1,updatedAt:2,recordRevision:0,...overrides}) as unknown as CloudRun;
const prompt=(overrides:Record<string,unknown>={})=>({id:'a0000000-0000-4000-8000-000000000004',kind:'prompt-optimize',draftId:'d0000000-0000-4000-8000-000000000005',executionState:'succeeded',billingState:'settled',createdAt:1,updatedAt:2,recordRevision:0,...overrides}) as unknown as CloudRun;
it('flags an unknown video submission with the task centre link and no auto-resend',()=>{
 const [item]=attentionItems([video({executionState:'submit_unknown'})]);
 expect(item).toMatchObject({title:'视频提交结果未知',href:'/tasks'});
 expect(item.detail).toContain('不会自动重发');
});
it('flags a failed video run and keeps succeeded runs silent',()=>{
 const items=attentionItems([video({executionState:'failed_confirmed'}),video()]);
 expect(items).toHaveLength(1);expect(items[0].title).toContain('未完成');
});
it('reports a save-pending issue only when the state itself is not already flagged',()=>{
 expect(attentionItems([video({executionState:'running',issueCode:'RESULT_SAVE_PENDING'})])[0].title).toBe('视频任务需要处理');
 expect(attentionItems([video({executionState:'submit_unknown',issueCode:'UPLOAD_UNKNOWN'})])).toHaveLength(1);
});
it('links unknown and failed prompt calls to the draft history',()=>{
 const items=attentionItems([prompt({executionState:'response_unknown'}),prompt({executionState:'failed_confirmed',errorCode:'UPSTREAM_FAILED'})]);
 expect(items.map(item=>item.href)).toEqual(['/prompt-generator/history?draft=d0000000-0000-4000-8000-000000000005','/prompt-generator/history?draft=d0000000-0000-4000-8000-000000000005']);
 expect(items[1].detail).toContain('UPSTREAM_FAILED');
});
it('ignores imported read-only history',()=>{
 expect(attentionItems([video({historical:true,executionState:'submit_unknown'})])).toHaveLength(0);
});
