import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,type Fixture} from './account-fixture.js';
let env:Fixture;beforeEach(async()=>{env=await fixture({workspace:true});});afterEach(async()=>{await env?.close();});
it('reads project, graph and undo depth from a consistent owned workspace snapshot',async()=>{
 const a=await env.signup('Snapshot_A'),b=await env.signup('Snapshot_B');const p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'同步快照'}})).json<{id:string}>();
 const path=`/studio-api/projects/${p.id}/workspace`;
 const empty=await env.call('GET',path,env.headers(a));expect(empty.statusCode).toBe(200);expect(empty.json()).toMatchObject({project:{revision:0},graph:{revision:0},history:{undoDepth:0,redoDepth:0}});
 await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'text',title:'文字',x:0,y:0,locked:false,data:{kind:'text',text:'已保存',referenceTokens:[]}}}}]}}});
 expect((await env.call('GET',path,env.headers(a))).json()).toMatchObject({project:{revision:1},graph:{revision:1},history:{undoDepth:1,redoDepth:0}});expect((await env.call('GET',path,env.headers(b))).statusCode).toBe(404);
});
