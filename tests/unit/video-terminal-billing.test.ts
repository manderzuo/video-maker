import {it,expect} from 'vitest';
import {parseVideoTask} from '../../src/adapters/core/contracts';
import {safeVideoFailureCode,videoFailureMessage} from '../../src/domain/video-failure';
import {applyQueryObservation} from '../../src/domain/run-status';
import {f} from '../helpers/fixtures';

it('QA58: the real expired policy response exposes its stable reason and confirmed settlement',()=>{
 const task=parseVideoTask({request_id:'original-request',task:{id:'task-1',status:'failed',error:{code:'budget_policy_expired',message:'PRIVATE_PROVIDER_TEXT',billing_state:'settled'}}});
 expect(task).toMatchObject({status:'failed',errorCode:'budget_policy_expired',billingState:'settled'});
 expect(safeVideoFailureCode(task.errorCode)).toBe('budget_policy_expired');
 expect(videoFailureMessage(task.errorCode)).toContain('预算');
 expect(JSON.stringify(task)).not.toContain('PRIVATE_PROVIDER_TEXT');
 const next=applyQueryObservation(f.run({taskId:'task-1',coreRequestId:'original-request',executionState:'running',billingState:'pending_reconciliation'}),{ok:true,value:task});
 expect(next).toMatchObject({executionState:'failed_confirmed',billingState:'settled',coreRequestId:'original-request'});
});

it.each([['settled','settled'],['released','released']] as const)('QA58: explicit %s billing is preserved without implying successful generation',(wire,want)=>{
 const task=parseVideoTask({task:{id:'task-1',status:'failed',error:{code:'video_execution_failed',billing_state:wire}}});
 expect(task.billingState).toBe(want);
 expect(task.status).toBe('failed');
});

it('QA58: expired video budget is a recognized public failure instead of a generic missing reason',()=>{
 expect(safeVideoFailureCode('budget_policy_expired')).toBe('budget_policy_expired');
 expect(videoFailureMessage('budget_policy_expired')).toContain('预算');
});

it('QA58: final billing can arrive after failure without changing the original execution or body',()=>{
 const run=f.run({taskId:'task-1',coreRequestId:'original-request',executionState:'failed_confirmed',billingState:'pending_reconciliation'});
 const task=parseVideoTask({request_id:'read-only-query',task:{id:'task-1',status:'failed',error:{code:'video_execution_failed',billing_state:'settled'}}});
 const next=applyQueryObservation(run,{ok:true,value:task});
 expect(next).toMatchObject({executionState:'failed_confirmed',billingState:'settled',coreRequestId:'original-request',idempotencyKey:run.idempotencyKey});
 expect(next.inputSnapshot).toEqual(run.inputSnapshot);
});


it('F0: query records the safe reason and preserves original identity through every billing update',()=>{
 const run=f.run({taskId:'task-1',coreRequestId:'original-request',executionState:'running',billingState:'pending_reconciliation'});
 const task=parseVideoTask({task:{id:'task-1',status:'failed',error:{code:'video_execution_failed',billing_state:'pending',upstream:{code:3003,message:'input image content[1] may contain real person'}}}});
 let next=applyQueryObservation(run,{ok:true,value:task});
 expect(next).toMatchObject({failure:task.failure,executionState:'failed_confirmed'});
 const finished=next.executionFinishedAt;
 for(const billing_state of ['pending','settled','released']){
  next=applyQueryObservation(next,{ok:true,value:parseVideoTask({task:{id:'task-1',status:'failed',error:{code:'video_execution_failed',billing_state}}})});
  expect(next).toMatchObject({failure:task.failure,taskId:run.taskId,coreRequestId:run.coreRequestId,idempotencyKey:run.idempotencyKey,executionFinishedAt:finished});
  expect(next.inputSnapshot).toEqual(run.inputSnapshot);
 }
 next=applyQueryObservation(next,{ok:false,error:{httpStatus:503,category:'unavailable',errorCode:'core_http_error',submissionOutcome:'unknown'}});
 expect(next).toMatchObject({failure:task.failure,executionState:'failed_confirmed',billingState:'released'});
});
