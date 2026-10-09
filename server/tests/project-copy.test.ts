import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {fixture,type Fixture,type Account} from './account-fixture.js';
let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true});});
afterEach(async()=>{await env?.close();});
async function source(a:Account){
 const p=(await env.call('POST','/studio-api/projects',{...env.headers(a),payload:{title:'原项目',tags:['故事']}})).json();
 const text={id:randomUUID(),type:'text',title:'正文',x:0,y:0,locked:false,data:{kind:'text',text:'复制内容',referenceTokens:[]}};
 const video={id:randomUUID(),type:'video-generation',title:'视频',x:400,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'fake-model'},inputBindings:[],stale:true}};
 const edge={id:randomUUID(),sourceId:text.id,targetId:video.id,port:'text',order:0};
 const r=await env.call('POST',`/studio-api/projects/${p.id}/commands`,{...env.headers(a),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[text,video].map(node=>({id:randomUUID(),type:'add_node',payload:{node}})).concat([{id:randomUUID(),type:'add_edge',payload:{edge}}] as never[])}}});
 expect(r.statusCode).toBe(200);return r.json();
}
const copy=(a:Account,id:string,expectedRevision:number,idempotencyKey=randomUUID())=>env.call('POST',`/studio-api/projects/${id}/copy`,{...env.headers(a),payload:{expectedRevision,idempotencyKey,title:'复制项目'}});
it('copies the current owned graph atomically with fresh node/edge identities and no executable task',async()=>{
 const a=await env.signup(),s=await source(a),r=await copy(a,s.project.id,1);expect(r.statusCode).toBe(201);
 const next=r.json();expect(next.project).toMatchObject({title:'复制项目',revision:0,tags:['故事'],trashedAt:null});expect(next.project.id).not.toBe(s.project.id);
 expect(next.graph.projectId).toBe(next.project.id);expect(next.graph.nodes.map((n:{id:string})=>n.id)).not.toEqual(s.graph.nodes.map((n:{id:string})=>n.id));
 expect(next.graph.nodes[0].data.text).toBe('复制内容');expect(next.graph.edges[0]).toMatchObject({sourceId:next.graph.nodes[0].id,targetId:next.graph.nodes[1].id});
 expect(next.graph.nodes[1].data.inputBindings[0].nodeId).toBe(next.graph.nodes[0].id);expect(next.history).toEqual({undoDepth:0,redoDepth:0});
 expect((await env.call('GET',`/studio-api/projects/${s.project.id}/graph`,env.headers(a))).json()).toEqual(s.graph);
});
it('retries the same copy receipt and partitions its key by owner',async()=>{
 const a=await env.signup('Copy_A'),b=await env.signup('Copy_B'),sa=await source(a),sb=await source(b),key=randomUUID();
 const first=await copy(a,sa.project.id,1,key),repeat=await copy(a,sa.project.id,1,key);expect(first.statusCode).toBe(201);expect(repeat.statusCode).toBe(201);expect(repeat.json().project.id).toBe(first.json().project.id);
 expect((await copy(b,sb.project.id,1,key)).statusCode).toBe(201);
 expect((await env.pool.query('SELECT id FROM workspace_projects WHERE user_id=$1',[a.view.user.id])).rows).toHaveLength(2);
 expect((await copy(a,sa.project.id,0,key)).statusCode).toBe(409);
});
it('refuses another account, stale source revisions and trash without creating a project',async()=>{
 const a=await env.signup('CopyOwner'),b=await env.signup('CopyOther'),s=await source(a);
 expect((await copy(b,s.project.id,1)).statusCode).toBe(404);expect((await copy(a,s.project.id,0)).statusCode).toBe(409);
 await env.call('DELETE',`/studio-api/projects/${s.project.id}`,{...env.headers(a),payload:{expectedRevision:1}});
 expect((await copy(a,s.project.id,2)).statusCode).toBe(409);expect((await env.pool.query('SELECT id FROM workspace_projects')).rows).toHaveLength(1);
});
it('rolls back the copied graph and metadata when recording a copy receipt fails',async()=>{
 const a=await env.signup(),s=await source(a);
 await env.pool.query(`CREATE FUNCTION reject_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fake receipt failure'; END $$`);
 await env.pool.query('CREATE TRIGGER reject_copy BEFORE INSERT ON workspace_project_copies FOR EACH ROW EXECUTE FUNCTION reject_copy()');
 expect((await copy(a,s.project.id,1)).statusCode).toBe(500);expect((await env.pool.query('SELECT id FROM workspace_projects')).rows).toHaveLength(1);expect((await env.pool.query('SELECT project_id FROM workspace_graphs')).rows).toHaveLength(1);
});
