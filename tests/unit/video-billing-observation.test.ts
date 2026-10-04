import {it,expect} from 'vitest';
import {parseVideoTask} from '../../src/adapters/core/contracts';
import {applyQueryObservation} from '../../src/domain/run-status';
import {observeVideoTask} from '../../src/domain/video-run-machine';
import {taskCanArchive,taskCanRefresh,type TaskListItem} from '../../src/features/tasks/task-filters';
import {f} from '../helpers/fixtures';

const recovery={request_id:'original-request',task:{id:'task-1',status:'failed',error:{code:'bridge_recovery_required',billing_state:'pending',http_status:503}}};
it('QA30: actual gateway recovery response retains pending billing without confirming a failed execution',()=>{
 const task=parseVideoTask(recovery);
 expect(task).toMatchObject({taskId:'task-1',status:'unknown',errorCode:'bridge_recovery_required',billingState:'pending_reconciliation'});
 const run=f.run({taskId:'task-1',coreRequestId:'original-request',executionState:'running'});
 const next=applyQueryObservation(run,{ok:true,value:task});
 expect(next).toMatchObject({executionState:'running',queryState:'interrupted',billingState:'pending_reconciliation',coreRequestId:'original-request'});
 expect(taskCanArchive(next)).toBe(false);
});
it('QA30: an unverified first observation keeps the known original task, then can observe genuine completion without a new submit',()=>{
 const initial=observeVideoTask(f.run({executionState:'submitting'}),parseVideoTask(recovery));
 expect(initial).toMatchObject({taskId:'task-1',executionState:'accepted',queryState:'interrupted',billingState:'pending_reconciliation'});
 const completed=applyQueryObservation(initial,{ok:true,value:parseVideoTask({task:{id:'task-1',status:'completed',content_url:'https://media.invalid/result.mp4'}})});
 expect(completed).toMatchObject({taskId:'task-1',executionState:'succeeded',billingState:'pending_reconciliation'});
 expect(completed.idempotencyKey).toBe(initial.idempotencyKey);
 expect(completed.inputSnapshot).toEqual(initial.inputSnapshot);
});
it('QA30: a genuine failed task remains failed; billing pending alone cannot rewrite execution evidence',()=>{
 const actualFailure=parseVideoTask({task:{id:'task-1',status:'failed',error:{code:'upstream_generation_failed',billing_state:'pending'}}});
 expect(actualFailure.status).toBe('failed');
 expect(applyQueryObservation(f.run({taskId:'task-1',executionState:'running'}),{ok:true,value:actualFailure})).toMatchObject({executionState:'failed_confirmed',billingState:'pending_reconciliation'});
});
it('QA28: submission and later terminal observations preserve an explicit pending reconciliation',()=>{
 const task=parseVideoTask(recovery),run=f.run({executionState:'submitting'});
 const failed=observeVideoTask(run,task);
 expect(failed.billingState).toBe('pending_reconciliation');
 const later=applyQueryObservation(failed,{ok:true,value:parseVideoTask({task:{id:'task-1',status:'failed'}})});
 expect(later.billingState).toBe('pending_reconciliation');
 expect(observeVideoTask(f.run({taskId:'task-1',executionState:'failed_confirmed'}),task).billingState).toBe('pending_reconciliation');
});
it('QA28: a failed task with pending billing remains eligible only for its original authorized read',()=>{
 const run=f.run({taskId:'task-1',executionState:'failed_confirmed',billingState:'pending_reconciliation'});
 const item:TaskListItem={...run,kind:'video',record:run,title:'待核对视频',projectTitle:'测试项目',projectArchived:false,nodeExists:true,draftExists:false,archived:false};
 const active={client:{profile:{id:run.connectionId,originSnapshot:run.originSnapshot},binding:{id:run.authBindingId}}} as Parameters<typeof taskCanRefresh>[2];
 expect(taskCanRefresh(item,false,active)).toBe(true);
 expect(taskCanRefresh({...item,billingState:'not_provided'},false,active)).toBe(false);
 expect(taskCanRefresh({...item,authBindingId:'other'},false,active)).toBe(false);
});
it('QA28: unrecognized billing text cannot imply settled or released credits',()=>{
 for(const state of ['refunded','free','constructor','some_new_state']){
  expect(parseVideoTask({task:{id:'task-1',status:'failed',error:{billing_state:state}}}).billingState).toBe('not_provided');
 }
});
