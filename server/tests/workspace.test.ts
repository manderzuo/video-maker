import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,type Fixture,type Account} from './account-fixture.js';

let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true});});
afterEach(async()=>{await env?.close();});
async function create(account:Account,title='我的云端项目'){
 const response=await env.call('POST','/studio-api/projects',{...env.headers(account),payload:{title}});
 expect(response.statusCode).toBe(201);
 return response.json<{id:string;title:string;revision:number;createdAt:number;updatedAt:number;trashedAt:number|null}>();
}

it('creates the owned project and its empty graph in the database, without exposing ownership fields',async()=>{
 const account=await env.signup(),project=await create(account);
 expect(project).toMatchObject({title:'我的云端项目',revision:0,trashedAt:null});
 expect(project).not.toHaveProperty('userId');expect(project).not.toHaveProperty('user_id');
 const graph=await env.call('GET',`/studio-api/projects/${project.id}/graph`,env.headers(account));
 expect(graph.statusCode).toBe(200);
 expect(graph.json()).toEqual({projectId:project.id,revision:0,nodes:[],edges:[],viewport:{x:0,y:0,scale:1}});
 const stored=await env.pool.query('SELECT user_id,revision FROM workspace_projects WHERE id=$1',[project.id]);
 expect(stored.rows).toEqual([{user_id:account.view.user.id,revision:0}]);
});

it('lists only the current account projects',async()=>{
 const a=await env.signup('Cloud_A'),b=await env.signup('Cloud_B'),project=await create(a);
 const own=await env.call('GET','/studio-api/projects',env.headers(a));
 const other=await env.call('GET','/studio-api/projects',env.headers(b));
 expect(own.statusCode).toBe(200);expect(own.json().map((item:{id:string})=>item.id)).toEqual([project.id]);
 expect(other.statusCode).toBe(200);expect(other.json()).toEqual([]);
});

it.each(['GET','PATCH','DELETE'] as const)('rejects another account %s on a guessed project without leaking metadata',async method=>{
 const a=await env.signup('Cloud_A'),b=await env.signup('Cloud_B'),project=await create(a);
 const response=await env.call(method,`/studio-api/projects/${project.id}`,{...env.headers(b),...(method==='GET'?{}:{payload:{expectedRevision:0,...(method==='PATCH'?{title:'非法更改'}:{})}})});
 expect(response.statusCode).toBe(404);expect(response.json()).toEqual({code:'NOT_FOUND'});
 const own=await env.call('GET',`/studio-api/projects/${project.id}`,env.headers(a));
 expect(own.json()).toMatchObject({title:'我的云端项目',revision:0,trashedAt:null});
});

it('rejects another account graph reads',async()=>{
 const a=await env.signup('Cloud_A'),b=await env.signup('Cloud_B'),project=await create(a);
 const response=await env.call('GET',`/studio-api/projects/${project.id}/graph`,env.headers(b));
 expect(response.statusCode).toBe(404);expect(response.json()).toEqual({code:'NOT_FOUND'});
});

it('requires a session and the current workspace context on project APIs',async()=>{
 expect((await env.call('GET','/studio-api/projects')).statusCode).toBe(401);
 const a=await env.signup('Cloud_A'),b=await env.signup('Cloud_B');
 const stale=await env.call('POST','/studio-api/projects',{...env.headers(b),context:a.view.contextId,payload:{title:'不能串号'}});
 expect(stale.statusCode).toBe(409);expect(stale.json()).toEqual({code:'SESSION_CHANGED'});
 expect((await env.call('GET','/studio-api/projects',env.headers(b))).json()).toEqual([]);
});

it.each(['userId','owner','user_id'])('rejects client supplied %s ownership',async field=>{
 const account=await env.signup();
 const response=await env.call('POST','/studio-api/projects',{...env.headers(account),payload:{title:'不能指定归属',[field]:account.view.user.id}});
 expect(response.statusCode).toBe(400);
});

it('commits metadata and graph revision together, and returns conflict for a stale save',async()=>{
 const account=await env.signup(),project=await create(account);
 const changed=await env.call('PATCH',`/studio-api/projects/${project.id}`,{...env.headers(account),payload:{expectedRevision:0,title:'已保存的修改',description:'云端说明',tags:['故事'],starred:true}});
 expect(changed.statusCode).toBe(200);expect(changed.json()).toMatchObject({title:'已保存的修改',description:'云端说明',tags:['故事'],starred:true,revision:1});
 const conflict=await env.call('PATCH',`/studio-api/projects/${project.id}`,{...env.headers(account),payload:{expectedRevision:0,title:'过期设备的覆盖'}});
 expect(conflict.statusCode).toBe(409);expect(conflict.json()).toEqual({code:'REVISION_CONFLICT'});
 const graph=await env.call('GET',`/studio-api/projects/${project.id}/graph`,env.headers(account));
 expect(graph.json().revision).toBe(1);
 const current=await env.call('GET',`/studio-api/projects/${project.id}`,env.headers(account));expect(current.json().title).toBe('已保存的修改');
});

it('serializes competing device saves so exactly one revision is accepted',async()=>{
 const account=await env.signup(),project=await create(account);
 const results=await Promise.all(['设备 A','设备 B'].map(title=>env.call('PATCH',`/studio-api/projects/${project.id}`,{...env.headers(account),payload:{expectedRevision:0,title}})));
 expect(results.map(result=>result.statusCode).sort()).toEqual([200,409]);
 const current=await env.call('GET',`/studio-api/projects/${project.id}`,env.headers(account));expect(current.json().revision).toBe(1);
});

it('moves a project to owned trash without deleting its graph and refuses a stale deletion',async()=>{
 const a=await env.signup('Cloud_A'),b=await env.signup('Cloud_B'),project=await create(a);
 const removed=await env.call('DELETE',`/studio-api/projects/${project.id}`,{...env.headers(a),payload:{expectedRevision:0}});
 expect(removed.statusCode).toBe(200);expect(removed.json().trashedAt).toBeGreaterThan(0);expect(removed.json().revision).toBe(1);
 expect((await env.call('GET','/studio-api/projects',env.headers(a))).json()).toEqual([]);
 expect((await env.call('GET','/studio-api/projects?trashed=true',env.headers(a))).json().map((item:{id:string})=>item.id)).toEqual([project.id]);
 expect((await env.call('GET','/studio-api/projects?trashed=true',env.headers(b))).json()).toEqual([]);
 expect((await env.call('GET',`/studio-api/projects/${project.id}/graph`,env.headers(a))).statusCode).toBe(200);
 const stale=await env.call('DELETE',`/studio-api/projects/${project.id}`,{...env.headers(a),payload:{expectedRevision:0}});expect(stale.statusCode).toBe(409);
});

it('rolls back metadata if its paired graph update fails',async()=>{
 const account=await env.signup(),project=await create(account);
 await env.pool.query(`CREATE FUNCTION reject_workspace_graph_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic graph write failure'; END $$`);
 await env.pool.query('CREATE TRIGGER reject_workspace_graph_write BEFORE UPDATE ON workspace_graphs FOR EACH ROW EXECUTE FUNCTION reject_workspace_graph_write()');
 const failed=await env.call('PATCH',`/studio-api/projects/${project.id}`,{...env.headers(account),payload:{expectedRevision:0,title:'不能假保存'}});
 expect(failed.statusCode).toBe(500);expect(failed.json()).toEqual({code:'INTERNAL_ERROR'});
 const current=await env.call('GET',`/studio-api/projects/${project.id}`,env.headers(account));expect(current.json()).toMatchObject({title:'我的云端项目',revision:0});
});

it('enforces project field limits and refuses revision and graph injection',async()=>{
 const account=await env.signup(),project=await create(account);
 for(const payload of [{title:' '},{title:'中'.repeat(61)},{title:'可以',description:'文'.repeat(501)},{title:'可以',tags:Array(11).fill('标签')},{title:'可以',revision:99},{title:'可以',graph:{nodes:[]}}]){
  expect((await env.call('POST','/studio-api/projects',{...env.headers(account),payload})).statusCode).toBe(400);
 }
 const invalid=await env.call('PATCH',`/studio-api/projects/${project.id}`,{...env.headers(account),payload:{expectedRevision:0}});expect(invalid.statusCode).toBe(400);
});
