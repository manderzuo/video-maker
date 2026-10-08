import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect,vi,afterEach} from 'vitest';
import {runSchema} from '../../src/domain/run';
import {applyQueryObservation} from '../../src/domain/run-status';
import {applySubmissionOutcome} from '../../src/domain/video-run-machine';
import {QueueRunProgress} from '../../src/features/tasks/QueueRunProgress';
import {f} from '../helpers/fixtures';

afterEach(()=>vi.restoreAllMocks());
const task=(status:'failed'|'completed',billingState:'pending_reconciliation'|'settled')=>({taskId:'task-1',status,contentAvailable:status==='completed',billingState});

it.each(['failed','completed'] as const)('QA58: %s execution time stays frozen through late billing queries',status=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(3000);
 const terminal=applyQueryObservation(f.run({taskId:'task-1',executionState:'running',createdAt:1000}),{ok:true,value:task(status,'pending_reconciliation')});
 expect(runSchema.parse(terminal)).toHaveProperty('executionFinishedAt',3000);
 expect(renderToStaticMarkup(createElement(QueueRunProgress,{run:terminal,now:99000}))).toContain('正在核对实际扣费和预冻结');
 clock.mockReturnValue(63000);
 const settled=applyQueryObservation(terminal,{ok:true,value:task(status,'settled')});
 expect(settled).toMatchObject({executionFinishedAt:3000,updatedAt:63000,billingState:'settled'});
 const markup=renderToStaticMarkup(createElement(QueueRunProgress,{run:settled,now:99000}));
 expect(markup).toContain('耗时 2秒');
 expect(markup).not.toContain('耗时 1分');
});

it('QA58: a legacy terminal record never invents an execution time from a later accounting update',()=>{
 const run=f.run({taskId:'task-1',executionState:'failed_confirmed',createdAt:1000,updatedAt:63000,billingState:'pending_reconciliation'});
 const markup=renderToStaticMarkup(createElement(QueueRunProgress,{run,now:99000}));
 expect(markup).toContain('耗时未记录');
 expect(markup).not.toContain('耗时 1分');
 const next=applyQueryObservation(run,{ok:true,value:task('failed','settled')});
 expect(next).not.toHaveProperty('executionFinishedAt');
});

it('QA58: an immediately final submission also records its first observed execution end',()=>{
 vi.spyOn(Date,'now').mockReturnValue(3000);
 const completed=applySubmissionOutcome(f.run({executionState:'submitting',createdAt:1000}),{ok:true,value:task('completed','settled')});
 expect(completed).toHaveProperty('executionFinishedAt',3000);
 const denied=applySubmissionOutcome(f.run({executionState:'submitting',createdAt:1000}),{ok:false,error:{httpStatus:403,category:'forbidden',errorCode:'insufficient_scope',submissionOutcome:'not_sent'}});
 expect(denied).toHaveProperty('executionFinishedAt',3000);
});
