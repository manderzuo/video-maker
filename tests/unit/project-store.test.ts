import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {openStudioDb,type StudioDb} from '../../src/infrastructure/storage/database';
import {saveProject,ProjectSaveSession} from '../../src/infrastructure/storage/project-repository';
import {saveRun,readRun} from '../../src/infrastructure/storage/run-repository';
import {f} from '../helpers/fixtures';
import {acquireProjectLease,type ProjectLeaseToken} from '../../src/infrastructure/storage/project-lease';
let factory:IDBFactory,db:StudioDb,writer:ProjectLeaseToken;
function req<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function seed(){const tx=db.connection.transaction('projects','readwrite');tx.objectStore('projects').put(f.project());await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
async function stored(){return req(db.connection.transaction('projects').objectStore('projects').get('p1'));}
beforeEach(async()=>{factory=new IDBFactory();db=await openStudioDb({factory,name:'aiwork-studio:test'});await seed();const acquired=await acquireProjectLease('p1','store-test',Date.now(),{db});if(!acquired.ok)throw new Error('lease_setup_failed');writer=acquired.token;});
afterEach(()=>{vi.restoreAllMocks();db.close();});
it('T05-C01: saved result follows transaction complete, not request success',async()=>{
 const order:string[]=[];let resolved=false,early=false;
 const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){const r=original.apply(this,args);if(this.name==='projects'){r.addEventListener('success',()=>{order.push('request');early=resolved;});this.transaction.addEventListener('complete',()=>order.push('complete'));}return r;});
 const pending=saveProject(f.project({revision:2}),1,{db,lease:writer}).then(r=>{resolved=true;order.push('saved');return r;});
 expect(await pending).toEqual({status:'saved',revision:2});expect(early).toBe(false);expect(order).toEqual(['request','complete','saved']);
});
it('concurrent CAS writers cannot both commit the same revision',async()=>{
 const results=await Promise.all([saveProject(f.project({revision:2,title:'甲'}),1,{db,lease:writer}),saveProject(f.project({revision:2,title:'乙'}),1,{db,lease:writer})]);
 expect(results.map(r=>r.status).sort()).toEqual(['conflict','saved']);expect((await stored()).revision).toBe(2);
});
it('unknown project schema stays intact when a current client tries to write',async()=>{
 const tx=db.connection.transaction('projects','readwrite');tx.objectStore('projects').put({...f.project(),schemaVersion:2,unknownFutureField:'保留'});await new Promise<void>(resolve=>{tx.oncomplete=()=>resolve();});
 expect((await saveProject(f.project({revision:2}),1,{db,lease:writer})).status).toBe('failed');expect((await stored()).unknownFutureField).toBe('保留');expect((await stored()).schemaVersion).toBe(2);
});
it('persisted unknown run identity and frozen request bytes cannot be replaced',async()=>{
 const run=f.run({executionState:'submit_unknown',finalBody:'{"prompt":"中文"}'});
 run.finalBodyHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(run.finalBody)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 await saveRun(run,{db,lease:writer,expectedProjectRevision:1});
 await expect(saveRun({...run,authBindingId:'binding-other'},{db,lease:writer,expectedProjectRevision:1})).rejects.toThrow('run_identity_frozen');
 await expect(saveRun({...run,finalBody:'{"prompt":"换请求"}'},{db,lease:writer,expectedProjectRevision:1})).rejects.toThrow('final_body_hash_mismatch');
 const read=await readRun('r1',db);expect(read?.finalBody).toBe(run.finalBody);expect(read?.authBindingId).toBe('binding-a');expect(read?.executionState).toBe('submit_unknown');
});
it('T05-C02: successful put followed by abort rolls back project, graph and run',async()=>{
 const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){const r=original.apply(this,args);if(this.name==='projects')r.addEventListener('success',()=>this.transaction.abort());return r;});
 const result=await saveProject(f.project({revision:2}),1,{db,lease:writer,graph:f.graph({revision:2}),runs:[f.run()]});
 expect(result.status).toBe('failed');expect((await stored()).revision).toBe(1);expect(await req(db.connection.transaction('runs').objectStore('runs').get('r1'))).toBeUndefined();
});
it('T05-C03: CAS rejects stale revision without replacing any data',async()=>{
 expect(await saveProject(f.project({revision:2,title:'不能覆盖'}),0,{db,lease:writer})).toEqual({status:'conflict',currentRevision:1});expect((await stored()).title).toBe('测试项目');
});
it('T05-C04: quota failure keeps draft and denies new paid submissions',async()=>{
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new DOMException('injected quota failure','QuotaExceededError');});
 const session=new ProjectSaveSession(f.project({revision:2,title:'未保存中文草稿'}));
 const result=await session.save(1,{db,lease:writer});expect(result).toEqual({status:'failed',code:'storage_quota_exceeded'});expect(session.draft.title).toBe('未保存中文草稿');expect(session.canSubmit()).toBe(false);expect((await stored()).revision).toBe(1);
});
it('T05-C05: blocked database upgrade instructs closing old tabs',async()=>{
 const old=await req(factory.open('aiwork-studio:blocked-test',1));
 await expect(openStudioDb({factory,name:'aiwork-studio:blocked-test'})).rejects.toThrow('db_blocked_close_old_tabs');old.close();
});
it('atomic graph/run recovery journal persists together and survives reopen',async()=>{
 expect(await saveProject(f.project({revision:2}),1,{db,lease:writer,graph:f.graph({revision:2}),runs:[f.run()]})).toEqual({status:'saved',revision:2});
 db.close();db=await openStudioDb({factory,name:'aiwork-studio:test'});
 expect((await stored()).revision).toBe(2);expect((await req(db.connection.transaction('graphs').objectStore('graphs').get('p1'))).revision).toBe(2);
 expect((await req(db.connection.transaction('runs').objectStore('runs').get('r1'))).idempotencyKey).toBe('fake-idempotency-r1');expect((await req(db.connection.transaction('diagnostics').objectStore('diagnostics').getAll())).length).toBe(1);
});
