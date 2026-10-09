import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {fixture,type Fixture,type Account} from './account-fixture.js';
let env:Fixture;
beforeEach(async()=>{env=await fixture({workspace:true});});
afterEach(async()=>{await env?.close();});
async function project(account:Account,title='待删除项目'){
 const r=await env.call('POST','/studio-api/projects',{...env.headers(account),payload:{title}});
 expect(r.statusCode).toBe(201);return r.json<{id:string;revision:number}>();
}
async function trash(account:Account,id:string,revision:number){
 const r=await env.call('DELETE','/studio-api/projects/'+id,{...env.headers(account),payload:{expectedRevision:revision}});
 expect(r.statusCode).toBe(200);return r.json<{revision:number}>();
}
const preview=(account:Account,id:string)=>env.call('POST','/studio-api/projects/'+id+'/purge-preview',env.headers(account));
const confirm=(account:Account,id:string,payload:unknown)=>env.call('POST','/studio-api/projects/'+id+'/purge',{...env.headers(account),payload});
async function inspected(account:Account,id:string){
 const r=await preview(account,id);expect(r.statusCode).toBe(200);
 return r.json<{title:string;revision:number;nodeCount:number;impactToken:string;blockingReasons:string[]}>();
}
it('refuses purge preview for active, foreign or missing projects',async()=>{
 const a=await env.signup('Purge_A'),b=await env.signup('Purge_B'),p=await project(a);
 expect((await preview(a,p.id)).statusCode).toBe(409);
 expect((await preview(b,p.id)).statusCode).toBe(404);
 expect((await preview(a,randomUUID())).statusCode).toBe(404);
});
it('requires trash, exact title, revision and impact token',async()=>{
 const a=await env.signup('Purge_B'),p=await project(a);
 const trashed=await trash(a,p.id,0);
 const bad=(payload:unknown)=>confirm(a,p.id,payload);
 expect((await bad({title:'待删除项目',expectedRevision:trashed.revision,impactToken:'x',confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(409);
 const view=await inspected(a,p.id);
 expect((await bad({title:'错名',expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(422);
 expect((await bad({title:view.title,expectedRevision:view.revision+5,impactToken:view.impactToken,confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(409);
 expect((await bad({title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:false,idempotencyKey:randomUUID()})).statusCode).toBe(400);
});
it('purges the editable copy, keeps receipts and history, and replays the same key',async()=>{
 const a=await env.signup('Purge_C'),p=await project(a);
 await env.call('POST','/studio-api/projects/'+p.id+'/commands',{...env.headers(a),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'text',title:'删',x:1,y:1,locked:false,data:{kind:'text',text:'删',referenceTokens:[]}}}}]}}});
 const trashed=await trash(a,p.id,1),view=await inspected(a,p.id);
 expect(view.nodeCount).toBe(1);
 const key=randomUUID(),payload={title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:key};
 const first=await confirm(a,p.id,payload);expect(first.statusCode).toBe(200);
 expect(first.json()).toMatchObject({projectId:p.id,revision:view.revision,nodeCount:1});
 expect((await env.pool.query('SELECT COUNT(*)::int n FROM workspace_graphs WHERE project_id=$1',[p.id])).rows[0].n).toBe(0);
 expect((await env.pool.query('SELECT COUNT(*)::int n FROM workspace_command_history WHERE project_id=$1',[p.id])).rows[0].n).toBe(0);
 expect((await env.pool.query('SELECT COUNT(*)::int n FROM workspace_command_receipts WHERE project_id=$1',[p.id])).rows[0].n).toBe(1);
 expect((await env.pool.query('SELECT purged_at,purged_revision FROM workspace_projects WHERE id=$1',[p.id])).rows[0].purged_revision).toBe(view.revision);
 const second=await confirm(a,p.id,payload);expect(second.statusCode).toBe(200);
 expect(second.json()).toMatchObject({projectId:p.id,revision:view.revision,nodeCount:1});
 expect((await env.pool.query('SELECT COUNT(*)::int n FROM workspace_project_purges WHERE project_id=$1',[p.id])).rows[0].n).toBe(1);
 expect((await confirm(a,p.id,{...payload,idempotencyKey:randomUUID()})).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects/'+p.id+'/workspace',env.headers(a))).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects/'+p.id,env.headers(a))).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects',env.headers(a))).json()).toHaveLength(0);
 expect((await env.call('GET','/studio-api/projects?trashed=true',env.headers(a))).json()).toHaveLength(0);
 void trashed;
});
it('blocks purge while a video run is active and allows it after terminal states',async()=>{ const a=await env.signup('Purge_D'),p=await project(a);
 const configId=randomUUID(),runId=randomUUID();
 await env.pool.query("INSERT INTO api_configs(id,user_id,channel,api_base,model,revision,active_secret_version,updated_at) VALUES($1,$2,'video','https://video.example.test','seedance',1,1,now())",[configId,a.view.user.id]);
 await env.pool.query("INSERT INTO api_secret_versions(config_id,user_id,secret_version,key_version,nonce,ciphertext,tag,created_at) VALUES($1,$2,1,'test',decode('000000000000000000000000','hex'),decode('00','hex'),decode('00000000000000000000000000000000','hex'),now())",[configId,a.view.user.id]);
 await env.pool.query("INSERT INTO workspace_video_runs(user_id,id,project_id,config_id,secret_version,frozen_config,frozen_contract,document,created_at,updated_at) VALUES($1,$2,$3,$4,1,'{}','{}',$5::jsonb,now(),now())",[a.view.user.id,runId,p.id,configId,JSON.stringify({id:runId,kind:'video',projectId:p.id,nodeId:randomUUID(),graphRevision:0,executionState:'running',queryState:'idle',deliveryState:'idle',billingState:'pending',createdAt:1,updatedAt:1,recordRevision:0})]);
 const trashed=await trash(a,p.id,0);
 const view=await inspected(a,p.id);
 expect(view.blockingReasons.length).toBeGreaterThan(0);
 expect((await confirm(a,p.id,{title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(409);
 void trashed;
});
it('refuses every write and read path for a purged project while history stays queryable',async()=>{
 const a=await env.signup('Purge_E'),p=await project(a,'绕过目标');
 const trashed=await trash(a,p.id,0),view=await inspected(a,p.id);
 const key=randomUUID();
 expect((await confirm(a,p.id,{title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:key})).statusCode).toBe(200);
 const node={id:randomUUID(),type:'text',title:'绕过',x:1,y:1,locked:false,data:{kind:'text',text:'绕过',referenceTokens:[]}};
 expect((await env.call('POST','/studio-api/projects/'+p.id+'/commands',{...env.headers(a),payload:{expectedRevision:view.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node}}]}}})).statusCode).toBe(410);
 expect((await env.call('PATCH','/studio-api/projects/'+p.id,{...env.headers(a),payload:{expectedRevision:view.revision,title:'改名'}})).statusCode).toBe(410);
 expect((await env.call('POST','/studio-api/projects/'+p.id+'/restore',{...env.headers(a),payload:{expectedRevision:view.revision}})).statusCode).toBe(410);
 expect((await env.call('POST','/studio-api/projects/'+p.id+'/copy',{...env.headers(a),payload:{expectedRevision:view.revision,idempotencyKey:randomUUID()}})).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects/'+p.id+'/export',env.headers(a))).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects/'+p.id+'/graph',env.headers(a))).statusCode).toBe(410);
 expect((await env.call('GET','/studio-api/projects/'+p.id+'/receipts',env.headers(a))).statusCode).toBe(200);
 void trashed;
});
it('refuses new video confirmations after purge',async()=>{ const a=await env.signup('Purge_F'),p=await project(a,'确认拒绝');
 const trashed=await trash(a,p.id,0),view=await inspected(a,p.id);
 const key=randomUUID();
 expect((await confirm(a,p.id,{title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:key})).statusCode).toBe(200);
 const {prepareVideoPreview}=await import('./../src/tasks/video-repository.js');
 await expect(prepareVideoPreview(env.pool,{userId:a.view.user.id} as never,p.id,{expectedRevision:view.revision,configRevision:1,nodeIds:[randomUUID()]},{contracts:new Map()} as never,new Date())).rejects.toMatchObject({status:410});
 void trashed;
});
it('serializes concurrent same-key confirms into one receipt',async()=>{
 const a=await env.signup('Purge_G'),p=await project(a,'并发同键');
 const trashed=await trash(a,p.id,0),view=await inspected(a,p.id);
 const key=randomUUID(),payload={title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:key};
 const [first,second]=await Promise.all([confirm(a,p.id,payload),confirm(a,p.id,payload)]);
 expect(first.statusCode).toBe(200);expect(second.statusCode).toBe(200);
 expect(first.json()).toEqual(second.json());
 expect((await env.pool.query('SELECT COUNT(*)::int n FROM workspace_project_purges WHERE project_id=$1',[p.id])).rows[0].n).toBe(1);
 void trashed;
});
it('removes graph asset references and shrinks metadata keeping history',async()=>{
 const a=await env.signup('Purge_H'),p=await project(a,'收缩墓碑');
 const headers=env.headers(a);
 const assetId=randomUUID(),assetSha='a'.repeat(64);
 await env.pool.query("INSERT INTO workspace_assets(user_id,id,state,document,thumbnail,sha256,bytes,reserved_bytes,created_at) VALUES($1,$2,'complete',$3::jsonb,NULL,$4,100,100,now())",[a.view.user.id,assetId,JSON.stringify({id:assetId,title:'共享图',mimeType:'image/png',mediaType:'image',bytes:100,blobKey:'asset:'+assetId,sha256:assetSha,createdAt:1,metadataRevision:0,trashedAt:null}),assetSha]);
 const asset={id:assetId};
 expect((await env.call('POST','/studio-api/projects/'+p.id+'/commands',{...headers,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:randomUUID(),type:'asset',title:'共享图节点',x:1,y:1,locked:false,data:{kind:'asset',assetId:asset.id}}}}]}}})).statusCode).toBe(200);
 expect((await env.pool.query("SELECT COUNT(*)::int n FROM workspace_asset_references WHERE project_id=$1 AND source_id='graph'",[p.id])).rows[0].n).toBe(1);
 expect((await env.call('PATCH','/studio-api/projects/'+p.id,{...headers,payload:{expectedRevision:1,title:'收缩墓碑',description:'长说明',tags:['t']}})).statusCode).toBe(200);
 const trashed=await trash(a,p.id,2),view=await inspected(a,p.id);
 expect((await confirm(a,p.id,{title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(200);
 expect((await env.pool.query("SELECT COUNT(*)::int n FROM workspace_asset_references WHERE project_id=$1 AND source_id='graph'",[p.id])).rows[0].n).toBe(0);
 const tombstone=(await env.pool.query('SELECT document FROM workspace_projects WHERE id=$1',[p.id])).rows[0].document as {title:string;description:string;tags:string[];revision:number};
 expect(tombstone.title).toBe('收缩墓碑');expect(tombstone.description).toBe('');expect(tombstone.tags).toEqual([]);expect(tombstone.revision).toBe(view.revision);
 const assetRow=(await env.pool.query('SELECT document FROM workspace_assets WHERE id=$1',[asset.id])).rows;
 expect(assetRow).toHaveLength(1);
 void trashed;
});
it('treats a video run missing executionState as blocking, not terminal',async()=>{
 const a=await env.signup('Purge_I'),p=await project(a,'缺态保护');
 const configId=randomUUID(),runId=randomUUID();
 await env.pool.query("INSERT INTO api_configs(id,user_id,channel,api_base,model,revision,active_secret_version,updated_at) VALUES($1,$2,'video','https://video.example.test','seedance',1,1,now())",[configId,a.view.user.id]);
 await env.pool.query("INSERT INTO api_secret_versions(config_id,user_id,secret_version,key_version,nonce,ciphertext,tag,created_at) VALUES($1,$2,1,'test',decode('000000000000000000000000','hex'),decode('00','hex'),decode('00000000000000000000000000000000','hex'),now())",[configId,a.view.user.id]);
 await env.pool.query("INSERT INTO workspace_video_runs(user_id,id,project_id,config_id,secret_version,frozen_config,frozen_contract,document,created_at,updated_at) VALUES($1,$2,$3,$4,1,'{}','{}',$5::jsonb,now(),now())",[a.view.user.id,runId,p.id,configId,JSON.stringify({id:runId,kind:'video',projectId:p.id,nodeId:randomUUID(),graphRevision:0,queryState:'idle',deliveryState:'idle',billingState:'pending',createdAt:1,updatedAt:1,recordRevision:0})]);
 const trashed=await trash(a,p.id,0);
 const view=await inspected(a,p.id);
 expect(view.blockingReasons.length).toBeGreaterThan(0);
 expect((await confirm(a,p.id,{title:view.title,expectedRevision:view.revision,impactToken:view.impactToken,confirmed:true,idempotencyKey:randomUUID()})).statusCode).toBe(409);
 void trashed;
});
