import {afterEach,beforeEach,expect,it} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {nodeSchema,type CanvasNode} from '../../src/domain/graph';
import {nodeSize,nodeRect} from '../../src/features/canvas/geometry';
import {copyNodes,pasteNodes} from '../../src/features/canvas/branch-command';
import {executeGraphOperations} from '../../src/application/commands/registry';
import {applyUiCommand} from '../../src/application/commands/apply-command';
import {undoProject,redoProject} from '../../src/application/commands/history';
import {openStudioDb,transact,requestResult,type StudioDb} from '../../src/infrastructure/storage/database';
import {acquireProjectLease,type ProjectLeaseToken} from '../../src/infrastructure/storage/project-lease';
import {f} from '../helpers/fixtures';

const asset:CanvasNode={id:'asset',type:'asset',title:'参考图',x:10,y:20,locked:false,data:{kind:'asset',assetId:'a1'}};
let db:StudioDb,lease:ProjectLeaseToken;
beforeEach(async()=>{
 db=await openStudioDb({factory:new IDBFactory(),name:'canvas-resize'});
 await transact(db,['projects','graphs','assets','runs'],'readwrite',tx=>{
  tx.objectStore('projects').put(f.project());tx.objectStore('graphs').put(f.graph({nodes:[asset]}));
  tx.objectStore('assets').put(f.asset({mediaType:'image',mimeType:'image/png'}));tx.objectStore('runs').put(f.run());
 });
 const acquired=await acquireProjectLease('p1','resize-test',Date.now(),{db});if(!acquired.ok)throw Error('lease_setup_failed');lease=acquired.token;
});
afterEach(()=>db.close());
const read=()=>transact(db,['graphs','runs'],'readonly',async tx=>({graph:await requestResult(tx.objectStore('graphs').get('p1')),run:await requestResult(tx.objectStore('runs').get('r1'))}));
const resize=(size:unknown,id='resize',baseRevision=1)=>({id,projectId:'p1',baseRevision,operations:[{id:'op-'+id,type:'update_node' as const,payload:{nodeId:'asset',patch:{size}}}]});

it('saved dimensions drive node bounds while legacy nodes keep their original size',()=>{
 const sized=nodeSchema.parse({...asset,size:{width:640,height:500}}),graph=f.graph({nodes:[sized]});
 expect(nodeSize(sized,graph)).toEqual({width:640,height:500});expect(nodeRect(sized,graph)).toEqual({left:10,top:20,right:650,bottom:520});
 expect(nodeSize(asset)).toEqual({width:320,height:200});
});
it('invalid dimensions and explicit group sizing cannot enter the shared graph schema',()=>{
 for(const size of [{width:0,height:300},{width:500,height:NaN},{width:500,height:Infinity},{width:2401,height:500},{width:500},{width:500,height:300,script:'bad'}])expect(nodeSchema.safeParse({...asset,size}).success).toBe(false);
 expect(nodeSchema.safeParse({id:'g',type:'group',title:'分组',x:0,y:0,locked:false,data:{kind:'group',childIds:[],collapsed:false},size:{width:500,height:300}}).success).toBe(false);
});
it('expanded groups and clipboard copies include resized child geometry without moving inputs',()=>{
 const child=nodeSchema.parse({...asset,size:{width:640,height:500}}),group:CanvasNode={id:'group',type:'group',title:'镜头',x:100,y:50,locked:false,data:{kind:'group',childIds:['asset'],collapsed:false}},graph=f.graph({nodes:[group,child]});
 expect(nodeSize(group,graph)).toEqual({width:674,height:544});expect(nodeRect(child,graph)).toEqual({left:110,top:70,right:750,bottom:570});
 const pasted=executeGraphOperations(graph,pasteNodes(copyNodes(graph,['asset']),graph)),copy=pasted.nodes.find(n=>!['asset','group'].includes(n.id))!;
 expect(nodeSize(copy,pasted)).toEqual({width:640,height:500});expect(pasted.nodes.find(n=>n.id==='asset')).toEqual(child);
});
it('resize uses the real transaction and history while preserving all execution records and video inputs',async()=>{
 const video:CanvasNode={id:'video',type:'video-generation',title:'视频',x:800,y:20,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance'},inputBindings:[{nodeId:'asset',assetId:'a1',order:0,role:'image'}],stale:false}};
 await transact(db,['graphs'],'readwrite',tx=>tx.objectStore('graphs').put(f.graph({nodes:[asset,video],edges:[{id:'edge',sourceId:'asset',targetId:'video',port:'image',order:0}]})));
 const before=await read(),command=resize({width:640,height:500});expect(await applyUiCommand(command,{db,lease})).toMatchObject({status:'applied',revision:2});
 const saved=await read();expect(saved.graph.nodes[0]).toMatchObject({size:{width:640,height:500},x:10,y:20});expect(saved.graph.nodes[1]).toEqual(video);expect(saved.graph.edges).toEqual(before.graph.edges);expect(saved.run).toEqual(before.run);
 expect((await applyUiCommand(command,{db,lease})).status).toBe('replayed');
 expect((await undoProject('p1',2,{db,lease,origin:'ui'})).status).toBe('applied');expect((await read()).graph.nodes[0]).toEqual(asset);
 expect((await redoProject('p1',3,{db,lease,origin:'ui'})).status).toBe('applied');expect((await read()).graph.nodes[0]).toMatchObject({size:{width:640,height:500}});expect((await read()).run).toEqual(before.run);
});
it('locked nodes reject dimension changes without modifying stored creative or execution data',async()=>{
 await transact(db,['graphs'],'readwrite',tx=>tx.objectStore('graphs').put(f.graph({nodes:[{...asset,locked:true}]})));
 const before=await read();expect(await applyUiCommand(resize({width:640,height:500}),{db,lease})).toMatchObject({status:'rejected',errorCode:'command_node_locked'});expect(await read()).toEqual(before);
});
it('invalid dimensions are rejected atomically through the actual command boundary',async()=>{
 const before=await read();expect((await applyUiCommand(resize({width:-1,height:500}),{db,lease})).status).toBe('rejected');expect(await read()).toEqual(before);
});
