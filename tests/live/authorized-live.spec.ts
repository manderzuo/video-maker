import {test} from '@playwright/test';
import {loadLiveApproval} from '../helpers/live-approval.mjs';
test('T48 actual authorized Core integration remains unverified until separately approved real probes produce evidence',async()=>{
 const {decision}=await loadLiveApproval();test.skip(!decision.allowed,'尚未获得完整真实业务授权；跳过不是验收通过。');
 // Deliberately fail closed. No Key is read and no real request is made by this prepared case.
 throw Error('T48 actual probe executor and Core credit enforcement must be verified under separate human authorization. Approval metadata alone cannot pass live acceptance.');
});
