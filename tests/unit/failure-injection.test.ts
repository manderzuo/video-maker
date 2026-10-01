import {it,expect} from 'vitest';
import {runCrashScenario} from '../helpers/failure-fixtures';
it('T45-C01: actual local dispatch fixture must interrupt before send, leaving a durable original and zero POST',async()=>{
 const result=await runCrashScenario('before-send');expect(result.videoSubmissions).toBe(0);expect(result.run.executionState).toBe('persisted');expect(result.run.finalBody).toBeTruthy();expect(result.run).toEqual(result.original);expect(result.reopenedPaidRequests).toBe(0);
});
it('T45-C02: real loopback response loss leaves one unknown original and reopening never submits a replacement',async()=>{
 const result=await runCrashScenario('after-send-before-reply');expect(result.videoSubmissions).toBe(1);expect(result.run.executionState).toBe('submit_unknown');expect(result.reopenedPaidRequests).toBe(0);expect(result.run.idempotencyKey).toBeTruthy();expect(result.run).toEqual(result.original);expect(result.resumedDispatchError).toBe('submission_requires_recovery');
});
