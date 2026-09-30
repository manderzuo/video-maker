import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult,type StudioDb,type TableName} from '../../src/infrastructure/storage/database';
import {getDeletionImpact,deleteLocalResource,type DeleteTarget} from '../../src/features/projects/delete-policy';
import {acquireProjectLease,type ProjectLeaseToken} from '../../src/infrastructure/storage/project-lease';
import {f} from '../helpers/fixtures';
import {deleteBatch,restoreProject} from '../../src/features/projects/trash-service';
let db:StudioDb,lease:ProjectLeaseToken;
const put=(store:TableName,value:unknown)=>transact(db,[store],'readwrite',tx=>{tx.objectStore(store).put(value);});
const read=(store:TableName,id:string)=>transact(db,[store],'readonly',tx=>requestResult(tx.objectStore(store).get(id)));
const confirm=async(target:DeleteTarget)=>{const impact=await getDeletionImpact(target,{db});return {impactHash:impact.impactHash,displayedCounts:impact.displayedCounts,projectTitle:'测试项目'};};
beforeEach(async()=>{
 db=await openStudioDb({factory:new IDBFactory(),name:'retention'});
 await put('projects',f.project());await put('graphs',f.graph({nodes:[{id:'n1',type:'asset',title:'素材',x:0,y:0,locked:false,data:{kind:'asset',assetId:'a1'}}]}));
 await put('assets',f.asset());await put('blobs',{id:'blob-a1',blob:new Blob(['原创'])});
 const result=await acquireProjectLease('p1','retention-test',Date.now(),{db});if(!result.ok)throw new Error('lease_setup_failed');lease=result.token;
});
afterEach(()=>{db.close();vi.restoreAllMocks();});
it('T08-C01: deleting a node preserves its asset and run evidence',async()=>{
 await put('runs',f.run({executionState:'succeeded'}));
 const target:DeleteTarget={kind:'node',id:'n1',projectId:'p1',mode:'permanent'};
 const result=await deleteLocalResource(target,await confirm(target),{db,lease,expectedRevision:1});expect(result.success).toBe(true);
 expect((await read('graphs','p1')).nodes).toHaveLength(0);expect(await read('assets','a1')).toBeDefined();expect(await read('runs','r1')).toBeDefined();
});
it('T08-C02: referenced asset permanent removal is blocked',async()=>{
 const impact=await getDeletionImpact({kind:'asset',id:'a1',mode:'permanent'},{db});expect(impact.blockers).toContain('asset_referenced');expect(impact.deletable).toBe(false);
});
it('T08-C03: unknown/active run tracking survives soft deletion and blocks permanent deletion',async()=>{
 await put('runs',f.run({executionState:'submit_unknown'}));
 const soft:DeleteTarget={kind:'project',id:'p1',mode:'soft'};
 expect((await deleteLocalResource(soft,await confirm(soft),{db,lease,expectedRevision:1})).success).toBe(true);
 expect((await read('projects','p1')).trashedAt).not.toBeNull();expect((await read('runs','r1')).executionState).toBe('submit_unknown');
 const target:DeleteTarget={...soft,mode:'permanent'};const impact=await getDeletionImpact(target,{db});expect(impact.blockers).toContain('active_or_unknown_tracking');
 expect((await deleteLocalResource(target,await confirm(target),{db,lease,expectedRevision:2})).success).toBe(false);expect(await read('projects','p1')).toBeDefined();
});
it('T08-C04: same blob across projects and historical inputs is retained',async()=>{
 await put('projects',f.project({id:'p2'}));await put('graphs',f.graph({projectId:'p2',nodes:[{id:'n2',type:'asset',title:'共享',x:0,y:0,locked:false,data:{kind:'asset',assetId:'a1'}}]}));
 await put('runs',f.run({executionState:'succeeded',inputSnapshot:{references:[{assetId:'a1'}]}}));
 const target:DeleteTarget={kind:'project',id:'p1',mode:'soft'};const impact=await getDeletionImpact(target,{db});expect(impact.sharedAssets).toContain('a1');
 await deleteLocalResource(target,await confirm(target),{db,lease,expectedRevision:1});expect(await read('blobs','blob-a1')).toBeDefined();
 await put('graphs',f.graph({projectId:'p2'}));await put('graphs',f.graph({revision:2}));
 expect((await getDeletionImpact({kind:'asset',id:'a1',mode:'permanent'},{db})).blockers).toContain('asset_referenced');
});
it('T08 confirmation is bound to displayed counts and impact; concurrent changes force a new confirmation',async()=>{
 const target:DeleteTarget={kind:'project',id:'p1',mode:'soft'},confirmation=await confirm(target);
 await put('runs',f.run({executionState:'running'}));
 const result=await deleteLocalResource(target,confirmation,{db,lease,expectedRevision:1});expect(result.errorCode).toBe('deletion_impact_changed');
 expect((await read('projects','p1')).trashedAt).toBeNull();
});
it('T08 permanent project removal preserves historical runs and media instead of cancelling remotely',async()=>{
 await put('projects',f.project({trashedAt:1000}));await put('runs',f.run({executionState:'succeeded',inputSnapshot:{assetId:'a1'}}));
 const spy=vi.spyOn(globalThis,'fetch'),target:DeleteTarget={kind:'project',id:'p1',mode:'permanent'};
 const result=await deleteLocalResource(target,await confirm(target),{db,lease,expectedRevision:1});expect(result.success).toBe(true);expect(await read('projects','p1')).toBeUndefined();expect(await read('runs','r1')).toBeDefined();expect(await read('blobs','blob-a1')).toBeDefined();expect(spy).not.toHaveBeenCalled();
});
it('T08-C05: batch failures are reported per item while safe items succeed',async()=>{
 await put('assets',f.asset({id:'a2',blobKey:'blob-a2',sha256:'b'.repeat(64)}));await put('blobs',{id:'blob-a2',blob:new Blob(['另一素材'])});
 const blocked:DeleteTarget={kind:'asset',id:'a1',mode:'permanent'},safe:DeleteTarget={kind:'asset',id:'a2',mode:'permanent'};
 const report=await deleteBatch([{target:blocked,confirmation:await confirm(blocked)},{target:safe,confirmation:await confirm(safe)}],{db});
 expect(report.succeeded).toBe(1);expect(report.failed).toBe(1);expect(report.results[0].errorCode).toBe('asset_referenced');expect(await read('assets','a1')).toBeDefined();expect(await read('assets','a2')).toBeUndefined();
});
it('soft-deleted assets remain readable and retain referenced bytes',async()=>{
 const target:DeleteTarget={kind:'asset',id:'a1',mode:'soft'};
 expect((await deleteLocalResource(target,await confirm(target),{db})).success).toBe(true);
 expect((await getDeletionImpact({...target,mode:'permanent'},{db})).blockers).toContain('asset_referenced');expect(await read('blobs','blob-a1')).toBeDefined();
});
it('project restore retains explicit imported attachments after graph references are rebuilt',async()=>{
 await put('references',{id:'import:p1:a1',projectId:'p1',assetId:'a1',revision:1,kind:'project-import'});
 await put('graphs',f.graph());await put('projects',f.project({trashedAt:1000}));
 expect((await restoreProject('p1',{db,lease,expectedRevision:1})).success).toBe(true);
 expect(await read('references','import:p1:a1')).toBeDefined();expect((await getDeletionImpact({kind:'asset',id:'a1',mode:'permanent'},{db})).blockers).toContain('asset_referenced');
});
