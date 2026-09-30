import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,type StudioDb} from '../../src/infrastructure/storage/database';
import {acquireProjectLease,takeoverProjectLease,renewProjectLease} from '../../src/infrastructure/storage/project-lease';
import {claimRunDispatch,markRunDispatched} from '../../src/infrastructure/storage/run-lease';
import {saveProject} from '../../src/infrastructure/storage/project-repository';
import {startProjectHeartbeat,releaseProjectLease} from '../../src/infrastructure/storage/project-lease';
import {acquireRunTrackingLease} from '../../src/infrastructure/storage/run-lease';
import {saveRun,readRun} from '../../src/infrastructure/storage/run-repository';
import {f} from '../helpers/fixtures';
let db:StudioDb,now:number;
beforeEach(async()=>{
 now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);db=await openStudioDb({factory:new IDBFactory(),name:'aiwork-studio:lease-test'});
 const run=f.run({finalBody:'{}'});run.finalBodyHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('{}')))).map(b=>b.toString(16).padStart(2,'0')).join('');
 await transact(db,['projects','runs'],'readwrite',tx=>{tx.objectStore('projects').put(f.project());tx.objectStore('runs').put(run);});
});
afterEach(()=>{db.close();vi.useRealTimers();vi.restoreAllMocks();});
it('T06-C01: only one tab obtains writer ownership',async()=>{
 const results=await Promise.all([acquireProjectLease('p1','a',now,{db}),acquireProjectLease('p1','b',now,{db})]);expect(results.filter(r=>r.ok)).toHaveLength(1);
});
it('invalid renewal time is rejected rather than poisoning the lease record',async()=>{
 const a=await acquireProjectLease('p1','a',now,{db});if(!a.ok)throw new Error('setup');expect((await renewProjectLease(a.token,NaN,{db})).ok).toBe(false);
});
it('foreground renews every 5s; hidden tabs do not renew; expired foreground becomes readonly',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']});let visible=true;const lost:string[]=[];
 const a=await acquireProjectLease('p1','a',now,{db});if(!a.ok)throw new Error('setup');const heartbeat=startProjectHeartbeat(a.token,code=>lost.push(code),{db,isForeground:()=>visible});
 now=6000;await vi.advanceTimersByTimeAsync(5000);
 const read=()=>new Promise<{expiresAt:number}>((resolve,reject)=>{const r=db.connection.transaction('leases').objectStore('leases').get('project:p1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await vi.waitFor(async()=>{expect((await read()).expiresAt).toBe(36000);});
 visible=false;now=11000;await vi.advanceTimersByTimeAsync(5000);expect((await read()).expiresAt).toBe(36000);
 visible=true;now=36001;await vi.advanceTimersByTimeAsync(5000);await vi.waitFor(()=>expect(lost).toEqual(['lease_expired_writer_denied']));heartbeat.stop();
});
it('release retains epoch history, preventing ABA after reacquisition',async()=>{
 const a=await acquireProjectLease('p1','a',now,{db});if(!a.ok)throw new Error('setup');await releaseProjectLease(a.token,db);const b=await acquireProjectLease('p1','b',now,{db});expect(b.ok&&b.epoch>a.epoch).toBe(true);expect((await saveProject(f.project({revision:2}),1,{db,lease:a.token})).status).toBe('failed');
});
it('run tracking revisions reject concurrent state writes and survive loss of project lease',async()=>{
 const claim=await claimRunDispatch('r1','a',{db,now});if(!claim.ok)throw new Error('setup');const committed=await markRunDispatched(claim.token,{db,now});if(!committed.ok)throw new Error('setup');const run=await readRun('r1',db);if(!run)throw new Error('setup');
 const updates=await Promise.allSettled([saveRun({...run,queryState:'polling'},{db,runToken:committed.token}),saveRun({...run,queryState:'paused_by_user'},{db,runToken:committed.token})]);expect(updates.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 now=31001;await takeoverProjectLease('p1','new-project-writer',now,{db});const tracker=await acquireRunTrackingLease('r1','tracker',now,db);if(!tracker.ok)throw new Error('setup');const current=await readRun('r1',db);if(!current)throw new Error('setup');
 await expect(saveRun({...current,billingState:'pending_reconciliation'},{db,runToken:tracker.token})).resolves.toBeUndefined();expect((await claimRunDispatch('r1','tracker',{db,now})).ok).toBe(false);expect((await readRun('r1',db))?.finalBody).toBe('{}');
});
it('T06-C02: force takeover increments epoch and denies old writer at database',async()=>{
 const a=await acquireProjectLease('p1','a',now,{db});const b=await takeoverProjectLease('p1','b',now,{db});expect(a.ok&&b.ok&&b.epoch>a.epoch).toBe(true);
 if(!a.ok)throw new Error('setup');const result=await saveProject(f.project({revision:2}),1,{db,...{lease:a.token}});expect(result.status).toBe('failed');
});
it('T06-C03: sleeping expired writer cannot renew or write',async()=>{
 const a=await acquireProjectLease('p1','a',now,{db});if(!a.ok)throw new Error('setup');now=31001;
 expect((await renewProjectLease(a.token,now,{db})).ok).toBe(false);
 expect((await saveProject(f.project({revision:2}),1,{db,...{lease:a.token}})).status).toBe('failed');
});
it('T06-C04: run dispatch is single flight across tabs',async()=>{
 const results=await Promise.all([claimRunDispatch('r1','a',{db,now}),claimRunDispatch('r1','b',{db,now})]);expect(results.filter(r=>r.ok)).toHaveLength(1);
});
it('T06-C05: no broadcast is needed for database enforcement',async()=>{
 expect((await saveProject(f.project({revision:2}),1,{db})).status).toBe('failed');
});
it('dispatch sent marker survives lease expiry and project takeover',async()=>{
 const claim=await claimRunDispatch('r1','a',{db,now});if(!claim.ok)throw new Error('setup');expect((await markRunDispatched(claim.token,{db,now})).ok).toBe(true);
 now=100000;await takeoverProjectLease('p1','b',now,{db});expect((await claimRunDispatch('r1','b',{db,now})).ok).toBe(false);
});
it('unsent expired claim can transfer, while old claimant cannot mark dispatch',async()=>{
 const a=await claimRunDispatch('r1','a',{db,now});if(!a.ok)throw new Error('setup');now=31001;const b=await claimRunDispatch('r1','b',{db,now});expect(b.ok).toBe(true);expect((await markRunDispatched(a.token,{db,now})).ok).toBe(false);
});
