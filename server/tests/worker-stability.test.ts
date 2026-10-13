import {afterEach,beforeEach,expect,it} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,type Fixture,type Account} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
let f:Fixture,root:string,calls:OutboundRequest[],mode:'success'|'failed'|'unknown'|'preflight',time:Date;
const base='https://video.example.test',video=Buffer.from('000000186674797069736F6D0000020069736F6D69736F32','hex');
const contract={version:'mock-video-v1',verification:'reviewed' as const,evidence:[{kind:'mock' as const,reference:'isolated fake provider only'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,chat:false,assets:true,workContext:false,continuation:false,backup:false},textModels:[],videoModels:['seedance'],videoAliases:[],videoSpecs:[{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}],limits:{assetBytes:1024*1024,promptBytes:12288,imageReferences:1,videoReferences:0}};
let dependencies:{secrets:ApiSecrets;outbound:RestrictedOutbound};
const assets=()=>({root,maxAssetBytes:1024*1024,userQuotaBytes:8*1024*1024,maxThumbnailBytes:256*1024});
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'aiwork-video-task-test-'));calls=[];mode='success';time=new Date('2026-10-08T12:00:00Z');dependencies={secrets:new ApiSecrets({activeVersion:'test',keys:new Map([['test',Buffer.alloc(32,8)]])}),outbound:new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{calls.push(request);if(request.method==='POST'&&mode==='unknown')throw Error('FAKE_PRIVATE_TIMEOUT');if(request.url.endsWith('/v1/assets')){const input=JSON.parse(request.body!.toString()),bytes=Buffer.from(input.data_base64,'base64');return {status:200,body:Buffer.from(JSON.stringify({object:'asset',id:'owned-upload-'+createHash('sha256').update(bytes).digest('hex').slice(0,12),mime_type:input.mime_type,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),created_at:1791460800,expires_at:1791464400}))};}if(request.url.endsWith('/content'))return {status:200,body:video};if(request.url.endsWith('/generations')&&mode==='preflight')return {status:400,body:Buffer.from(JSON.stringify({error:{code:'reference_resource_unavailable',message:'PRIVATE_SIGNED_URL'}}))};if(request.url.endsWith('/generations'))return {status:200,body:Buffer.from(JSON.stringify({task:{id:'fake-'+createHash('sha256').update(request.apiKey).digest('hex').slice(0,12),status:'queued'}}))};return {status:200,body:Buffer.from(JSON.stringify({task:{id:'fake-'+createHash('sha256').update(request.apiKey).digest('hex').slice(0,12),status:mode==='failed'?'failed':'completed',content_url:'https://127.0.0.1/PRIVATE_SHOULD_NEVER_FETCH',...(mode==='failed'?{error:{code:'video_execution_failed',billing_state:'pending',message:'FAKE_PRIVATE_LOG',upstream:{code:3003,message:'input image content[1] may contain real person'}}}:{})}}))};}})};f=await fixture({workspace:true,content:true,apiSettings:dependencies,assets:assets(),videoContracts:new Map([[base,contract]])});});
afterEach(async()=>{await f?.close();if(root.startsWith(join(tmpdir(),'aiwork-video-task-test-')))await rm(root,{recursive:true,force:true});});
async function setup(name:string,key:string){const account=await f.signup(name);expect((await f.call('PATCH','/studio-api/me/model-configs/video',{...f.headers(account),payload:{apiBase:base,model:'seedance',apiKey:key,expectedRevision:null}})).statusCode).toBe(200);const project=(await f.call('POST','/studio-api/projects',{...f.headers(account),payload:{title:'视频任务项目'}})).json();const textId=randomUUID(),nodeId=randomUUID();const saved=await f.call('POST','/studio-api/projects/'+project.id+'/commands',{...f.headers(account),payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:textId,type:'text',title:'创意',x:0,y:0,locked:false,data:{kind:'text',text:'雨后街道',referenceTokens:[]}}}},{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'video-generation',title:'视频',x:400,y:0,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'},inputBindings:[],stale:true}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId:textId,targetId:nodeId,port:'text',order:0}}}]}}});expect(saved.statusCode).toBe(200);return {account,projectId:project.id,nodeId,revision:1};}
async function preview(owner:Awaited<ReturnType<typeof setup>>){owner.revision=(await f.call('GET','/studio-api/projects/'+owner.projectId+'/workspace',f.headers(owner.account))).json().graph.revision;const response=await f.call('POST','/studio-api/projects/'+owner.projectId+'/video-run-preview',{...f.headers(owner.account),payload:{expectedRevision:owner.revision,configRevision:1,nodeIds:[owner.nodeId]}});expect(response.statusCode).toBe(201);return response.json();}
const confirm=(owner:Awaited<ReturnType<typeof setup>>,approvalId:string)=>f.call('POST','/studio-api/projects/'+owner.projectId+'/video-runs',{...f.headers(owner.account),payload:{approvalId,decision:{confirmed:true,acknowledgeVideoFee:true}}});
async function work(){const {executeNextVideoTask}=await import('../src/tasks/video-worker.js');const result=await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time));time=new Date(time.getTime()+5000);return result;}
const read=(account:Account,id:string)=>f.call('GET','/studio-api/runs/'+id,f.headers(account));
import {executeNextVideoTask,startVideoWorker} from '../src/tasks/video-worker.js';
import {executeNextPromptTask} from '../src/tasks/prompt-worker.js';
it('queries all due tasks fairly even when older queries are slow',async()=>{
 const a=await setup('AuditSchedule','FAKE_AUDIT_KEY'),ids:string[]=[];
 for(let i=0;i<3;i++)ids.push((await confirm(a,(await preview(a)).id)).json()[0].id);
 for(let i=0;i<3;i++){const run=(await read(a.account,ids[i])).json();await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb,created_at=$3,next_query_at=NULL WHERE id=$1',[ids[i],JSON.stringify({...run,executionState:'running',queryState:'polling',taskId:'audit-'+i}),new Date(time.getTime()+i)]);}
 const queried:string[]=[];dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{const id=new URL(request.url).pathname.split('/').pop()!;queried.push(id);time=new Date(time.getTime()+4000);return {status:200,body:Buffer.from(JSON.stringify({task:{id,status:'processing'}}))};}});
 for(let i=0;i<12;i++)await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time));
 expect(queried.slice(0,3)).toEqual(['audit-0','audit-1','audit-2']);
});

it('keeps query and delivery budgets available while a different run is submitting',async()=>{
 const a=await setup('Lanes','FAKE_LANES_KEY'),ids:string[]=[];
 for(let i=0;i<3;i++)ids.push((await confirm(a,(await preview(a)).id)).json()[0].id);
 for(const [index,state]of [[1,'running'],[2,'succeeded']] as const){const run=(await read(a.account,ids[index])).json();await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb WHERE id=$1',[ids[index],JSON.stringify({...run,taskId:'lanes-'+index,executionState:state,queryState:'polling'})]);}
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);const paths:string[]=[];
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{const path=new URL(request.url).pathname;paths.push(path);if(path.endsWith('/generations'))await gate;if(path.endsWith('/content'))return {status:200,body:video};return {status:200,body:Buffer.from(JSON.stringify({task:{id:path.endsWith('/generations')?'lanes-new':path.split('/').pop(),status:'processing'}}))};}});
 const worker=startVideoWorker(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time));
 try{await expect.poll(()=>paths,{timeout:2000}).toEqual(expect.arrayContaining(['/v1/videos/generations','/v1/videos/lanes-1','/v1/videos/lanes-2/content']));}finally{release();await worker.stop();}
 expect(paths.filter(path=>path.endsWith('/generations'))).toHaveLength(1);
});

it('backs off repeated query failures with a bounded delay while retaining task identity',async()=>{
 const a=await setup('Backoff','FAKE_BACKOFF_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:503,body:Buffer.from('{}')})});
 const delays:number[]=[];
 for(let i=0;i<9;i++){await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time));const due=(await f.pool.query('SELECT next_query_at FROM workspace_video_runs WHERE id=$1',[id])).rows[0].next_query_at as Date;delays.push(due.getTime()-time.getTime());time=due;}
 expect(delays[1]).toBeGreaterThan(delays[0]);expect(Math.max(...delays)).toBeLessThanOrEqual(300000);expect((await read(a.account,id)).json()).toMatchObject({executionState:'accepted',taskId:expect.stringMatching(/^fake-/)});
});

async function referenceAsset(account:Account,index:number){
 const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64'),Buffer.from([index])]),hash=createHash('sha256').update(bytes).digest('hex'),h=f.headers(account);
 const reserved=await f.call('POST','/studio-api/assets',{...h,payload:{title:'reference '+index,mimeType:'image/png',bytes:bytes.length,sha256:hash}});expect(reserved.statusCode).toBe(201);const id=reserved.json().id;
 expect((await f.app.inject({method:'PUT',url:'/studio-api/assets/'+id+'/content',payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin:'https://studio.test','content-type':'application/octet-stream'}})).statusCode).toBe(204);
 expect((await f.call('POST','/studio-api/assets/'+id+'/complete',{...h,payload:{}})).statusCode).toBe(200);
 return {assetId:id,mediaType:'image',role:'参考',alias:'image-'+index,sha256:hash,bytes:bytes.length};
}
it('refreshes an earlier upload that expires during a later upload before any generation send',async()=>{
 const a=await setup('Expiry','FAKE_EXPIRY_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id,refs=[await referenceAsset(a.account,1),await referenceAsset(a.account,2)],run=(await read(a.account,id)).json();
 await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb WHERE id=$1',[id,JSON.stringify({...run,inputSnapshot:{...run.inputSnapshot,references:refs}})]);
 let uploads=0;const expired=new Map<string,number>(),submitted:string[][]=[];
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{if(request.url.endsWith('/v1/assets')){uploads++;if(uploads===2)time=new Date(time.getTime()+20000);const input=JSON.parse(request.body!.toString()),bytes=Buffer.from(input.data_base64,'base64'),remote='expiry-'+uploads,expires=time.getTime()+(uploads===1?10000:3600000);expired.set(remote,expires);return {status:200,body:Buffer.from(JSON.stringify({object:'asset',id:remote,mime_type:input.mime_type,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),created_at:time.getTime()/1000,expires_at:expires/1000}))};}const body=JSON.parse(request.body!.toString());submitted.push(body.image_asset_ids);return {status:200,body:Buffer.from(JSON.stringify({task:{id:'expiry-task',status:'queued'}}))};}});
 await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time));
 expect(submitted).toHaveLength(1);expect(submitted[0].every(remote=>expired.get(remote)!>time.getTime())).toBe(true);expect(uploads).toBe(3);
 const saved=await f.pool.query('SELECT expires_at FROM workspace_video_uploads WHERE run_id=$1',[id]);expect(saved.rows.every(row=>row.expires_at>time)).toBe(true);
});
it.each(['expired','legacy','valid'] as const)('handles a %s persisted upload mapping without replaying generation',async kind=>{
 const a=await setup('Stored_'+kind,'FAKE_STORED_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id,ref=await referenceAsset(a.account,1),run=(await read(a.account,id)).json();
 await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb WHERE id=$1',[id,JSON.stringify({...run,inputSnapshot:{...run.inputSnapshot,references:[ref]}})]);
 await f.pool.query("INSERT INTO workspace_video_uploads(user_id,run_id,asset_id,state,remote_id,expires_at) VALUES($1,$2,$3,'succeeded','stored-asset',$4)",[a.account.view.user.id,id,ref.assetId,kind==='legacy'?null:new Date(time.getTime()+(kind==='valid'?3600000:-1))]);
 await work();
 expect(calls.filter(call=>call.url.endsWith('/v1/assets'))).toHaveLength(kind==='valid'?0:1);
 const submits=calls.filter(call=>call.url.endsWith('/generations'));expect(submits).toHaveLength(1);expect(submits[0].idempotencyKey).toBe(run.idempotencyKey);
 expect(JSON.parse(submits[0].body!.toString()).image_asset_ids).toEqual([kind==='valid'?'stored-asset':'owned-upload-'+ref.sha256.slice(0,12)]);
});

it('preserves pause during an active download and continues polling another run',async()=>{
 const a=await setup('DownloadPause','FAKE_DOWNLOAD_KEY'),ids:string[]=[];
 for(let i=0;i<2;i++)ids.push((await confirm(a,(await preview(a)).id)).json()[0].id);
 for(let i=0;i<2;i++){const run=(await read(a.account,ids[i])).json();await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb WHERE id=$1',[ids[i],JSON.stringify({...run,taskId:'download-'+i,executionState:i===0?'succeeded':'running',queryState:'polling'})]);}
 let release!:()=>void,arrived!:()=>void;const begun=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r);let contentCalls=0,queryCalls=0;
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{if(request.url.endsWith('/content')){contentCalls++;arrived();await gate;return {status:200,body:video};}queryCalls++;return {status:200,body:Buffer.from(JSON.stringify({task:{id:'download-1',status:'processing'}}))};}});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])},download=executeNextVideoTask(f.pool,deps,()=>new Date(time),'delivery');await begun;
 const run=(await read(a.account,ids[0])).json(),pause=await f.call('POST','/studio-api/runs/'+ids[0]+'/query-control',{...f.headers(a.account),payload:{expectedRevision:run.recordRevision,mode:'pause'}});expect(pause.statusCode).toBe(200);
 const duplicate=await executeNextVideoTask(f.pool,deps,()=>new Date(time),'delivery');await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');release();await download;
 expect(duplicate).toBe(false);expect(contentCalls).toBe(1);expect(queryCalls).toBe(1);expect((await read(a.account,ids[0])).json()).toMatchObject({queryState:'paused_by_user',deliveryState:'available_for_preview'});
});

it.each(['reference_asset_expired','reference_asset_missing'])('retains original identity and helper billing for Core terminal %s',async code=>{
 const a=await setup('Permanent_'+code.slice(-7),'FAKE_PERMANENT_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();const before=(await read(a.account,id)).json();
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:200,body:Buffer.from(JSON.stringify({task:{id:before.taskId,status:'failed',error:{code,billing_state:'pending'}}}))})});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])};await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');const first=(await f.pool.query('SELECT next_query_at FROM workspace_video_runs WHERE id=$1',[id])).rows[0].next_query_at as Date;const delay=first.getTime()-time.getTime();time=first;
 await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');const second=(await f.pool.query('SELECT next_query_at FROM workspace_video_runs WHERE id=$1',[id])).rows[0].next_query_at as Date;
 expect(second.getTime()-time.getTime()).toBeGreaterThan(delay);expect((await read(a.account,id)).json()).toMatchObject({executionState:'failed_confirmed',failure:{reasonCode:code},taskId:before.taskId,idempotencyKey:before.idempotencyKey,billingState:'pending_reconciliation'});
});

it('retries a failed delivery without querying or resubmitting the completed task',async()=>{
 const a=await setup('DeliveryRetry','FAKE_DELIVERY_RETRY_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();await work();let downloads=0;const paths:string[]=[];
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{paths.push(new URL(request.url).pathname);downloads++;return downloads===1?{status:503,body:Buffer.from('{}')}:{status:200,body:video};}});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])};await executeNextVideoTask(f.pool,deps,()=>new Date(time),'delivery');
 expect((await read(a.account,id)).json()).toMatchObject({executionState:'succeeded',deliveryState:'download_failed'});
 expect(await executeNextVideoTask(f.pool,deps,()=>new Date(time),'delivery')).toBe(false);
 time=(await f.pool.query('SELECT next_delivery_at FROM workspace_video_runs WHERE id=$1',[id])).rows[0].next_delivery_at;
 await executeNextVideoTask(f.pool,deps,()=>new Date(time),'delivery');expect(paths).toHaveLength(2);expect(paths.every(path=>path.endsWith('/content'))).toBe(true);expect((await read(a.account,id)).json().deliveryState).toBe('available_for_preview');
});

it('does not publish a downloaded result after recovery has fenced out its worker',async()=>{
 const a=await setup('DeliveryFence','FAKE_DELIVERY_FENCE_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();await work();
 let release!:()=>void,arrived!:()=>void;const begun=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>{arrived();await gate;return {status:200,body:video};}});
 const downloading=executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time),'delivery');await begun;
 await f.pool.query('UPDATE workspace_video_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1',[id]);release();await downloading;
 expect((await f.pool.query("SELECT id FROM workspace_assets WHERE document->>'sourceRunId'=$1",[id])).rows).toEqual([]);expect((await read(a.account,id)).json().resultAssetId).toBeUndefined();
});
it('pauses automatic queries on Core attention and manual resume only reads the original task',async()=>{
 const a=await setup('Attention','FAKE_ATTENTION_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();const original=(await read(a.account,id)).json();let reads=0;
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{expect(request.method).toBe('GET');expect(request.url).toBe(base+'/v1/videos/'+original.taskId);reads++;return {status:200,body:Buffer.from(JSON.stringify({task:{id:original.taskId,status:'processing',stage:'continuation_requires_attention',notice:{code:'budget_continuation_requires_attention',billing_state:'pending',message:'PRIVATE_DETAIL'}}}))};}});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])};await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');time=new Date(time.getTime()+60000);
 expect(await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query')).toBe(false);let run=(await read(a.account,id)).json();expect(run).toMatchObject({executionState:'running',queryState:'interrupted',attentionCode:'budget_continuation_requires_attention',taskId:original.taskId,idempotencyKey:original.idempotencyKey,billingState:'pending_reconciliation'});expect(JSON.stringify(run)).not.toContain('PRIVATE_DETAIL');
 expect((await f.call('POST','/studio-api/runs/'+id+'/query-control',{...f.headers(a.account),payload:{expectedRevision:run.recordRevision,mode:'resume'}})).statusCode).toBe(200);await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');run=(await read(a.account,id)).json();expect(run.queryState).toBe('interrupted');expect(reads).toBe(2);expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);
});
it.each(['resume','pause'] as const)('stops after an attention reply racing with %s without losing user pause',async mode=>{
 const a=await setup('AttentionRace_'+mode,'FAKE_ATTENTION_RACE_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();const original=(await read(a.account,id)).json();
 let release!:()=>void,arrived!:()=>void,reads=0;const begun=new Promise<void>(resolve=>arrived=resolve),gate=new Promise<void>(resolve=>release=resolve);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>{expect(request.method).toBe('GET');reads++;arrived();await gate;return {status:200,body:Buffer.from(JSON.stringify({task:{id:original.taskId,status:'processing',stage:'continuation_requires_attention',notice:{code:'budget_continuation_requires_attention',billing_state:'pending'}}}))};}});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])},query=executeNextVideoTask(f.pool,deps,()=>new Date(time),'query');await begun;
 try{const current=(await read(a.account,id)).json();expect((await f.call('POST','/studio-api/runs/'+id+'/query-control',{...f.headers(a.account),payload:{expectedRevision:current.recordRevision,mode}})).statusCode).toBe(200);}finally{release();await query;}
 expect((await read(a.account,id)).json()).toMatchObject({attentionCode:'budget_continuation_requires_attention',queryState:mode==='pause'?'paused_by_user':'interrupted',executionState:'running',taskId:original.taskId,idempotencyKey:original.idempotencyKey,billingState:'pending_reconciliation'});
 time=new Date(time.getTime()+60000);expect(await executeNextVideoTask(f.pool,deps,()=>new Date(time),'query')).toBe(false);expect(reads).toBe(1);
});
it('preserves a live query lease and final user intent through pause and resume',async()=>{
 const a=await setup('AuditLease','FAKE_AUDIT_KEY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();
 const releases:Array<()=>void>=[];let arrived:()=>void=()=>{};dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async request=>new Promise(resolve=>{const taskId=new URL(request.url).pathname.split('/').pop()!;releases.push(()=>resolve({status:200,body:Buffer.from(JSON.stringify({task:{id:taskId,status:'processing'}}))}));arrived();})});
 const deps={...dependencies,assets:assets(),contracts:new Map([[base,contract]])};let seen=new Promise<void>(r=>arrived=r);const one=executeNextVideoTask(f.pool,deps,()=>new Date(time));await seen;
 const run=(await read(a.account,id)).json(),pause=await f.call('POST','/studio-api/runs/'+id+'/query-control',{...f.headers(a.account),payload:{expectedRevision:run.recordRevision,mode:'pause'}});expect(pause.statusCode).toBe(200);
 const resume=await f.call('POST','/studio-api/runs/'+id+'/query-control',{...f.headers(a.account),payload:{expectedRevision:pause.json().recordRevision,mode:'resume'}});expect(resume.statusCode).toBe(200);
 const held=(await f.pool.query('SELECT lease_token FROM workspace_video_runs WHERE id=$1',[id])).rows[0].lease_token;
 const lastPause=await f.call('POST','/studio-api/runs/'+id+'/query-control',{...f.headers(a.account),payload:{expectedRevision:resume.json().recordRevision,mode:'pause'}});expect(lastPause.statusCode).toBe(200);
 const other=await executeNextVideoTask(f.pool,deps,()=>new Date(time));releases[0]();await one;expect(other).toBe(false);expect(held).toBeTruthy();expect(releases).toHaveLength(1);expect((await read(a.account,id)).json()).toMatchObject({queryState:'paused_by_user',executionState:'running'});
});
it('finalizes a saved prompt after its source project is purged and continues other users',async()=>{
 const account=await f.signup('AuditPromptOne'),other=await f.signup('AuditPromptTwo');for(const a of [account,other])expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a),payload:{apiBase:'https://text.example.test',model:'mock-text',apiKey:'FAKE_AUDIT_TEXT_KEY',expectedRevision:null}})).statusCode).toBe(200);
 const p=(await f.call('POST','/studio-api/projects',{...f.headers(account),payload:{title:'Audit source'}})).json();
 async function createPrompt(a:Account,sourceProjectId?:string){const d=await f.call('POST','/studio-api/prompt-drafts',{...f.headers(a),payload:{type:'video',userRequest:'雨后的街道',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',...(sourceProjectId?{sourceProjectId}:{}),idempotencyKey:randomUUID()}});expect(d.statusCode).toBe(201);const pr=await f.call('POST','/studio-api/prompt-drafts/'+d.json().id+'/optimization-preview',{...f.headers(a),payload:{expectedRevision:0,configRevision:1,referenceAliases:[]}});expect(pr.statusCode).toBe(201);const c=await f.call('POST','/studio-api/prompt-drafts/'+d.json().id+'/optimize',{...f.headers(a),payload:{approvalId:pr.json().id,decision:{confirmed:true,acknowledgeTextFee:true}}});expect(c.statusCode).toBe(202);return c.json();}
 const first=await createPrompt(account,p.id);let release!:()=>void,arrived!:()=>void;const started=new Promise<void>(r=>arrived=r);let completions=0;
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async()=>{completions++;if(completions===1){arrived();await new Promise<void>(r=>release=r);}return {status:200,body:Buffer.from(JSON.stringify({choices:[{message:{content:JSON.stringify({finalPrompt:'雨后的街道，镜头缓慢前进。',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{}})}}]}))};}});
 const running=executeNextPromptTask(f.pool,dependencies,()=>new Date(time));await started;
 const trash=await f.call('DELETE','/studio-api/projects/'+p.id,{...f.headers(account),payload:{expectedRevision:0}});expect(trash.statusCode).toBe(200);const view=await f.call('POST','/studio-api/projects/'+p.id+'/purge-preview',f.headers(account));expect(view.statusCode).toBe(200);expect(view.json().blockingReasons).toEqual([]);
 const purged=await f.call('POST','/studio-api/projects/'+p.id+'/purge',{...f.headers(account),payload:{title:view.json().title,expectedRevision:view.json().revision,impactToken:view.json().impactToken,confirmed:true,idempotencyKey:randomUUID()}});expect(purged.statusCode).toBe(200);release();await running;const second=await createPrompt(other);
 for(let i=0;i<3;i++)await executeNextPromptTask(f.pool,dependencies,()=>new Date(time));
 const rows=await f.pool.query("SELECT id,document->>'executionState' AS state FROM workspace_tasks ORDER BY id");expect(rows.rows.find(r=>r.id===first.id).state).toBe('succeeded');expect(rows.rows.find(r=>r.id===second.id).state).toBe('succeeded');expect(completions).toBe(2);
});
