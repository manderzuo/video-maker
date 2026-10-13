import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect,vi,afterAll} from 'vitest';
vi.hoisted(()=>{vi.stubGlobal('location',{pathname:'/',search:''});vi.stubGlobal('window',{addEventListener:()=>{},removeEventListener:()=>{}});});
afterAll(()=>vi.unstubAllGlobals());
import {parseVideoTask} from '../../src/adapters/core/contracts';
import {observeVideoTask} from '../../src/domain/video-run-machine';
import {applyQueryObservation,videoNeedsTracking} from '../../src/domain/run-status';
import {runSchema} from '../../src/domain/run';
import {cloudVideoRunSchema,portableVideoRun} from '../../src/domain/cloud-video-run';
import {QueueRunProgress,executionProgress} from '../../src/features/tasks/QueueRunProgress';
import {CloudVideoTaskDetail,cloudVideoStatus} from '../../src/features/workspace/CloudVideoTaskDetail';
import {taskExecutionLabel,type TaskListItem} from '../../src/features/tasks/task-filters';
import type {WorkspaceClient} from '../../src/infrastructure/api/workspace-client';
import {f} from '../helpers/fixtures';

const wire={request_id:'original-request',task:{id:'original-task',status:'processing',stage:'continuation_requires_attention',notice:{code:'budget_continuation_requires_attention',billing_state:'pending',request_id:'original-request',message:'PRIVATE_PROVIDER_DETAIL',type:'api_error'}}};
it.each(['task','video_task','data'] as const)('retains nonterminal attention and notice billing from %s without saving raw notices',wrapper=>{
 const parsed=parseVideoTask(wrapper==='data'?{data:{task:wire.task},request_id:wire.request_id}:{[wrapper]:wire.task,request_id:wire.request_id});
 expect(parsed).toMatchObject({status:'processing',attentionCode:'budget_continuation_requires_attention',billingState:'pending_reconciliation'});expect(JSON.stringify(parsed)).not.toContain('PRIVATE_');
 const initial=f.run({taskId:'original-task',executionState:'running',coreRequestId:'original-request',billingState:'settled'});
 for(const next of [observeVideoTask(initial,parsed),applyQueryObservation(initial,{ok:true,value:parsed})]){
  expect(runSchema.parse(next)).toMatchObject({executionState:'running',queryState:'interrupted',taskId:'original-task',coreRequestId:'original-request',idempotencyKey:initial.idempotencyKey,billingState:'pending_reconciliation',attentionCode:'budget_continuation_requires_attention'});
  expect(next.failure).toBeUndefined();expect(next.executionFinishedAt).toBeUndefined();expect(videoNeedsTracking(next)).toBe(false);
  const resumed=applyQueryObservation(next,{ok:true,value:parseVideoTask({task:{id:'original-task',status:'processing'}})});expect(resumed.attentionCode).toBeUndefined();expect(resumed.billingState).toBe('pending_reconciliation');expect(videoNeedsTracking(resumed)).toBe(true);
 }
});
it('shows manual attention and retained fees in cloud and local task views',()=>{
 const observed=observeVideoTask(f.run({executionState:'submitting'}),parseVideoTask(wire));
 const cloud=cloudVideoRunSchema.parse({...observed,kind:'video',configRevision:1,secretVersion:1,inputSnapshot:{prompt:'fictional fixture',spec:{modelId:'fake-video',durationSeconds:5,ratio:'16:9',resolution:'480p'},references:[]}});
 expect(cloudVideoStatus(cloud)).toContain('人工检查');expect(executionProgress(observed)).toContain('人工检查');expect(taskExecutionLabel({kind:'video',record:observed,executionState:observed.executionState} as TaskListItem)).toContain('人工检查');
 expect(portableVideoRun(cloud)).toHaveProperty('attentionCode','budget_continuation_requires_attention');
 for(const markup of [renderToStaticMarkup(createElement(QueueRunProgress,{run:observed,now:2000})),renderToStaticMarkup(createElement(CloudVideoTaskDetail,{client:{} as WorkspaceClient,task:cloud,onChanged:()=>{}}))]){
  expect(markup).toContain('人工检查');expect(markup).toContain('辅助步骤费用');expect(markup).toContain('查询原任务');expect(markup).not.toContain('正在生成');expect(markup).not.toContain('自动跟踪服务状态');
 }
});
it('ignores unrecognized notice codes without interpreting them as failures or financial evidence',()=>{
 const parsed=parseVideoTask({...wire,task:{...wire.task,notice:{code:'PRIVATE_UNKNOWN_CODE',billing_state:'released'}}});expect(parsed).not.toHaveProperty('attentionCode');expect(parsed.billingState).toBe('not_provided');expect(parsed.failure).toBeUndefined();
});
