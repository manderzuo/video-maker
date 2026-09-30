import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {openStudioDb,transact,requestResult,type StudioDb,type TableName} from '../../src/infrastructure/storage/database';
import {applyCommand,type CommandContext} from '../../src/application/commands/apply-command';
import {undoProject,redoProject} from '../../src/application/commands/history';
import type {CommandEnvelope} from '../../src/application/commands/registry';
import {acquireProjectLease,takeoverProjectLease,type ProjectLeaseToken} from '../../src/infrastructure/storage/project-lease';
import {f} from '../helpers/fixtures';
import {nodeSchema} from '../../src/domain/graph';
let db:StudioDb,lease:ProjectLeaseToken,context:CommandContext;
const put=(store:TableName,value:unknown)=>transact(db,[store],'readwrite',tx=>{tx.objectStore(store).put(value);});
const read=(store:TableName,id:string)=>transact(db,[store],'readonly',tx=>requestResult(tx.objectStore(store).get(id)));
function add(id='cmd-1',baseRevision=1,nodeId='text-1'):CommandEnvelope{return {id,projectId:'p1',baseRevision,leaseEpoch:lease.epoch,origin:'ui',operations:[{id:'op-'+id,type:'add_node',payload:{node:{id:nodeId,type:'text',title:'原创文本',x:0,y:0,locked:false,data:{kind:'text',text:'原创，不执行',referenceTokens:[]}}}}]};}
beforeEach(async()=>{db=await openStudioDb({factory:new IDBFactory(),name:'commands'});await put('projects',f.project());await put('graphs',f.graph());const acquired=await acquireProjectLease('p1','command-test',Date.now(),{db});if(!acquired.ok)throw new Error('lease_setup_failed');lease=acquired.token;context={db,lease,origin:'ui'};});
afterEach(()=>{db.close();vi.restoreAllMocks();});
it('T10-C01: unknown executable operations, HTML payload and secret fields are rejected atomically',async()=>{
 for(const operation of [{id:'x',type:'shell',payload:{command:'dir'}},{id:'x',type:'html',payload:{html:'<script>bad()</script>'}},{id:'x',type:'add_node',payload:{node:{...add().operations[0].payload.node as object,html:'<iframe>'}}}]){
  expect((await applyCommand({...add(),operations:[operation]},context)).status).toBe('rejected');
 }
 expect((await read('graphs','p1')).nodes).toHaveLength(0);
});
it('T10-C02: UI and authorized Agent use the same commit path; Agent cannot spoof UI origin',async()=>{
 expect((await applyCommand(add(),context)).status).toBe('applied');
 const agent={...add('cmd-agent',2,'text-2'),origin:'mcp' as const};
 expect((await applyCommand({...agent,origin:'ui'},{...context,origin:'mcp',authorize:()=>{}})).errorCode).toBe('command_origin_mismatch');
 expect((await applyCommand(agent,{...context,origin:'mcp'})).errorCode).toBe('agent_command_authorization_required');
 expect((await applyCommand(agent,{...context,origin:'mcp',authorize:()=>{}})).status).toBe('applied');expect((await read('graphs','p1')).nodes).toHaveLength(2);
});
it('T10-C03: undo/redo commits new revisions without sending any request',async()=>{
 const spy=vi.spyOn(globalThis,'fetch');await applyCommand(add(),context);
 expect((await undoProject('p1',2,context)).revision).toBe(3);expect((await read('graphs','p1')).nodes).toHaveLength(0);
 expect((await redoProject('p1',3,context)).revision).toBe(4);expect((await read('graphs','p1')).nodes).toHaveLength(1);
 expect((await read('projects','p1')).revision).toBe(4);expect(spy).not.toHaveBeenCalled();
});
it('T10-C04: duplicate commandId, including concurrent calls, returns receipt without duplicate nodes',async()=>{
 const results=await Promise.all([applyCommand(add(),context),applyCommand(add(),context)]);
 expect(results.map(r=>r.status).sort()).toEqual(['applied','replayed']);expect((await read('graphs','p1')).nodes).toHaveLength(1);
 const collision=add();collision.operations[0].payload.node={...(collision.operations[0].payload.node as object),title:'改内容'};
 expect((await applyCommand(collision,context)).errorCode).toBe('command_id_reused_with_different_input');
 await undoProject('p1',2,context);expect((await applyCommand(add(),context)).status).toBe('replayed');expect((await read('graphs','p1')).nodes).toHaveLength(0);
});
it('T10-C05: disconnect changes creative graph but never rewrites immutable run input snapshot',async()=>{
 const a=add().operations[0].payload.node,b={...a as object,id:'text-2'};
 await put('graphs',f.graph({nodes:[nodeSchema.parse(a),nodeSchema.parse(b)],edges:[{id:'e1',sourceId:'text-1',targetId:'text-2',port:'text',order:0}]}));
 const run=f.run({inputSnapshot:{references:[{assetId:'a1'}],prompt:'保留'}});await put('runs',run);
 const envelope={...add(),operations:[{id:'remove-edge',type:'remove_edge',payload:{edgeId:'e1'}}]};
 expect((await applyCommand(envelope,context)).status).toBe('applied');expect((await read('graphs','p1')).edges).toHaveLength(0);expect(await read('runs','r1')).toEqual(run);
});
it('stale epoch and stale revision cannot commit, and partial operation validation rolls back everything',async()=>{
 const stale={...add(),baseRevision:0};expect((await applyCommand(stale,context)).status).toBe('conflict');
 const bad={...add(),operations:[...add().operations,{id:'missing',type:'remove_node',payload:{nodeId:'does-not-exist'}}]};expect((await applyCommand(bad,context)).status).toBe('rejected');
 expect((await read('graphs','p1')).nodes).toHaveLength(0);expect(await read('receipts','cmd-1')).toBeUndefined();
 await takeoverProjectLease('p1','other',Date.now(),{db});expect((await applyCommand(add(),context)).status).toBe('rejected');
});
it('receipt write failure rolls back graph and revision, instead of leaving applied-but-unrecorded change',async()=>{
 const original=IDBObjectStore.prototype.put;vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){if(this.name==='receipts')throw new DOMException('fault','QuotaExceededError');return original.apply(this,args);});
 expect((await applyCommand(add(),context)).status).toBe('rejected');expect((await read('projects','p1')).revision).toBe(1);expect((await read('graphs','p1')).nodes).toHaveLength(0);
});
it('redo is cleared by a new edit and undo does not overwrite out-of-band graph changes',async()=>{
 await applyCommand(add(),context);await undoProject('p1',2,context);await applyCommand(add('new',3,'new-node'),context);
 expect((await redoProject('p1',4,context)).errorCode).toBe('history_empty');
 const graph=await read('graphs','p1');graph.nodes[0].title='外部修改';await put('graphs',graph);
 expect((await undoProject('p1',4,context)).errorCode).toBe('history_graph_changed');expect((await read('graphs','p1')).nodes[0].title).toBe('外部修改');
});
it('a new valid writer can recover the original command receipt without creating a second change',async()=>{
 await applyCommand(add(),context);const takeover=await takeoverProjectLease('p1','new-writer',Date.now(),{db});if(!takeover.ok)throw new Error('takeover_failed');
 const replay={...add(),leaseEpoch:takeover.epoch};expect((await applyCommand(replay,{...context,lease:takeover.token})).status).toBe('replayed');expect((await read('graphs','p1')).nodes).toHaveLength(1);expect((await read('projects','p1')).revision).toBe(2);
});
