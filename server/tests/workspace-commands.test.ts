import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,type Fixture,type Account} from './account-fixture.js';
let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true});});
afterEach(async()=>{await env?.close();});
const textNode=()=>({id:randomUUID(),type:'text',title:'云端文字',x:20,y:40,locked:false,data:{kind:'text',text:'保存后可换设备读取',referenceTokens:[]}});
const add=(node=textNode())=>({type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node}}]});
async function project(account:Account){const r=await env.call('POST','/studio-api/projects',{...env.headers(account),payload:{title:'云端画布'}});expect(r.statusCode).toBe(201);return r.json<{id:string;revision:number}>();}
const command=(account:Account,id:string,expectedRevision:number,value:unknown,idempotencyKey=randomUUID())=>env.call('POST',`/studio-api/projects/${id}/commands`,{...env.headers(account),payload:{expectedRevision,command:value,idempotencyKey}});
const graph=(account:Account,id:string)=>env.call('GET',`/studio-api/projects/${id}/graph`,env.headers(account));
it('saves typed graph commands, project revision and history in one server transaction',async()=>{
 const a=await env.signup(),p=await project(a),node=textNode();
 const saved=await command(a,p.id,0,add(node));expect(saved.statusCode).toBe(200);
 expect(saved.json()).toMatchObject({status:'applied',revision:1,graph:{nodes:[node],revision:1},project:{id:p.id,revision:1}});
 expect((await graph(a,p.id)).json().nodes).toEqual([node]);
 expect((await env.pool.query('SELECT revision FROM workspace_command_receipts WHERE user_id=$1 AND project_id=$2',[a.view.user.id,p.id])).rows).toEqual([{revision:1}]);
});
it('undoes and redoes persisted commands after reopening, without reverting project metadata',async()=>{
 const a=await env.signup(),p=await project(a),node=textNode();await command(a,p.id,0,add(node));
 await env.call('PATCH',`/studio-api/projects/${p.id}`,{...env.headers(a),payload:{expectedRevision:1,title:'保留此名称'}});
 const undone=await command(a,p.id,2,{type:'undo'});expect(undone.statusCode).toBe(200);expect(undone.json()).toMatchObject({revision:3,graph:{nodes:[]},project:{title:'保留此名称'}});
 const redone=await command(a,p.id,3,{type:'redo'});expect(redone.statusCode).toBe(200);expect(redone.json().graph.nodes).toEqual([node]);
});
it('replays an identical idempotency key but rejects different input and does not add duplicate nodes',async()=>{
 const a=await env.signup(),p=await project(a),value=add(),key=randomUUID();
 expect((await command(a,p.id,0,value,key)).statusCode).toBe(200);
 const replay=await command(a,p.id,0,value,key);expect(replay.statusCode).toBe(200);expect(replay.json()).toMatchObject({status:'replayed',revision:1});
 expect((await command(a,p.id,1,add(),key)).statusCode).toBe(409);expect((await graph(a,p.id)).json().nodes).toHaveLength(1);
});
it('applies a lost-response text-plus-edge batch exactly once on same-key retry and rejects a new key at the old revision',async()=>{
 const a=await env.signup(),p=await project(a),key=randomUUID(),textId=randomUUID(),videoId=randomUUID();
 const batch={type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{...textNode(),id:textId}}},{id:randomUUID(),type:'add_node',payload:{node:{id:videoId,type:'video-generation',title:'草稿',x:400,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-model'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:videoId,port:'text',order:0}}}]};
 const first=await command(a,p.id,0,batch,key);expect(first.statusCode).toBe(200);expect(first.json()).toMatchObject({status:'applied',revision:1});
 const retry=await command(a,p.id,0,batch,key);expect(retry.statusCode).toBe(200);expect(retry.json()).toMatchObject({status:'replayed',revision:1});
 expect((await graph(a,p.id)).json().nodes).toHaveLength(2);
 expect((await command(a,p.id,0,batch,randomUUID())).statusCode).toBe(409);
 expect((await graph(a,p.id)).json()).toMatchObject({revision:1});
});
it('serializes two devices and refuses stale commands, including stale undo',async()=>{
 const a=await env.signup(),p=await project(a);const results=await Promise.all([command(a,p.id,0,add()),command(a,p.id,0,add())]);
 expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);expect((await command(a,p.id,0,{type:'undo'})).statusCode).toBe(409);
});
it('partitions command identities and histories by owner and never mutates another account project',async()=>{
 const a=await env.signup('Canvas_A'),b=await env.signup('Canvas_B'),pa=await project(a),pb=await project(b),key=randomUUID();
 expect((await command(b,pa.id,0,add(),key)).statusCode).toBe(404);
 expect((await command(a,pa.id,0,add(),key)).statusCode).toBe(200);expect((await command(b,pb.id,0,add(),key)).statusCode).toBe(200);
 expect((await command(b,pa.id,1,{type:'undo'})).statusCode).toBe(404);expect((await graph(a,pa.id)).json().nodes).toHaveLength(1);
});
it('clears redo only after a new creative command and saves viewport without erasing history',async()=>{
 const a=await env.signup(),p=await project(a);await command(a,p.id,0,add());await command(a,p.id,1,{type:'undo'});
 expect((await command(a,p.id,2,{type:'viewport',viewport:{x:80,y:-20,scale:1.5}})).statusCode).toBe(200);
 expect((await command(a,p.id,3,{type:'redo'})).statusCode).toBe(200);
 await command(a,p.id,4,{type:'undo'});await command(a,p.id,5,add());
 const empty=await command(a,p.id,6,{type:'redo'});expect(empty.statusCode).toBe(409);expect(empty.json()).toEqual({code:'HISTORY_EMPTY'});
});
it('rejects invalid nodes, dangling edges, reused operation IDs and secret-bearing payloads without partial saves',async()=>{
 const a=await env.signup(),p=await project(a),node=textNode(),operation={id:randomUUID(),type:'add_node',payload:{node}};
 for(const value of [add({...node,x:Infinity}),add({...node,title:'中'.repeat(61)}),{type:'operations',operations:[operation,operation]},{type:'operations',operations:[operation,{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:node.id,targetId:randomUUID(),port:'text',order:0}}}]},{type:'operations',operations:[{...operation,payload:{node:{...node,data:{...node.data,apiKey:'fake-secret'}}}}]}]){
  const response=await command(a,p.id,0,value);expect(response.statusCode).toBe(400);
 }
 expect((await graph(a,p.id)).json()).toMatchObject({revision:0,nodes:[],edges:[]});
});
it('refuses unavailable asset references, including text tokens and embedded generation bindings',async()=>{
 const a=await env.signup(),p=await project(a);
 expect((await command(a,p.id,0,add())).statusCode).toBe(200);
 for(const node of [{...textNode(),data:{kind:'text',text:'非法引用',referenceTokens:[{assetId:randomUUID(),alias:'ref',mediaType:'image',role:'reference',description:'',available:true,unbound:false}]}},{id:randomUUID(),type:'video-generation',title:'草稿',x:0,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-model'},inputBindings:[{nodeId:randomUUID(),assetId:randomUUID(),order:0,role:'image'}],stale:true}}]){
  const r=await command(a,p.id,1,add(node as ReturnType<typeof textNode>));expect(r.statusCode).toBe(404);
 }
});
it('rolls back graph, revision and history when recording a receipt fails',async()=>{
 const a=await env.signup(),p=await project(a);
 await env.pool.query(`CREATE FUNCTION reject_command_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fake receipt failure'; END $$`);
 await env.pool.query('CREATE TRIGGER reject_command_receipt BEFORE INSERT ON workspace_command_receipts FOR EACH ROW EXECUTE FUNCTION reject_command_receipt()');
 expect((await command(a,p.id,0,add())).statusCode).toBe(500);
 expect((await graph(a,p.id)).json()).toMatchObject({revision:0,nodes:[]});
});
it('restores owned trash with a conditional revision and retains its graph and history',async()=>{
 const a=await env.signup('Restore_A'),b=await env.signup('Restore_B'),p=await project(a);await command(a,p.id,0,add());
 await env.call('DELETE',`/studio-api/projects/${p.id}`,{...env.headers(a),payload:{expectedRevision:1}});
 expect((await command(a,p.id,2,add())).statusCode).toBe(409);
 expect((await env.call('POST',`/studio-api/projects/${p.id}/restore`,{...env.headers(b),payload:{expectedRevision:2}})).statusCode).toBe(404);
 const restored=await env.call('POST',`/studio-api/projects/${p.id}/restore`,{...env.headers(a),payload:{expectedRevision:2}});expect(restored.statusCode).toBe(200);expect(restored.json()).toMatchObject({revision:3,trashedAt:null});
 expect((await command(a,p.id,3,{type:'undo'})).statusCode).toBe(200);
});
it('derives generation bindings when text, draft and connection are created in one transaction and records removed inputs',async()=>{
 const a=await env.signup(),p=await project(a),node=textNode(),video={id:randomUUID(),type:'video-generation',title:'草稿',x:400,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-model'},inputBindings:[],stale:false}};
 const saved=await command(a,p.id,0,{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node}},{id:randomUUID(),type:'add_node',payload:{node:video}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:node.id,targetId:video.id,port:'text',order:0}}}]});
 expect(saved.statusCode).toBe(200);expect(saved.json().graph.nodes[1].data).toMatchObject({inputBindings:[{nodeId:node.id,order:0,role:'text'}],stale:true});
 const removed=await command(a,p.id,1,{type:'operations',operations:[{id:randomUUID(),type:'remove_node',payload:{nodeId:node.id}}]});expect(removed.statusCode).toBe(200);expect(removed.json().graph.nodes[0].data).toMatchObject({inputBindings:[],missingInputNodeIds:[node.id],stale:true});
});
