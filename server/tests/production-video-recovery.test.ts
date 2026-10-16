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
async function addImage(owner:Awaited<ReturnType<typeof setup>>,order=1){
 const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=','base64'),Buffer.from([order])]),hash=createHash('sha256').update(bytes).digest('hex');const reserved=await f.call('POST','/studio-api/assets',{...f.headers(owner.account),payload:{title:'已确认参考图片',mimeType:'image/png',bytes:bytes.length,sha256:hash}});expect(reserved.statusCode).toBe(201);const assetId=reserved.json().id,h=f.headers(owner.account);expect((await f.app.inject({method:'PUT',url:'/studio-api/assets/'+assetId+'/content',payload:bytes,headers:{cookie:h.cookie,'x-workspace-context':h.context,'x-csrf-token':h.csrf,origin:'https://studio.test','content-type':'application/octet-stream'}})).statusCode).toBe(204);expect((await f.call('POST','/studio-api/assets/'+assetId+'/complete',{...h,payload:{}})).statusCode).toBe(200);
 const sourceId=randomUUID(),saved=await f.call('POST','/studio-api/projects/'+owner.projectId+'/commands',{...h,payload:{expectedRevision:owner.revision,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:sourceId,type:'asset',title:'图片参考',x:0,y:300,locked:false,data:{kind:'asset',assetId}}}},{id:randomUUID(),type:'add_edge',payload:{edge:{id:randomUUID(),sourceId,targetId:owner.nodeId,port:'image',order}}}]}}});expect(saved.statusCode,saved.body).toBe(200);owner.revision++;return hash;
}

it('upload 429 waits for Retry-After then continues the same unpaid run',async()=>{
 const a=await setup('RecoveryUpload429','FAKE_KEY_UPLOAD');await addImage(a);const id=(await confirm(a,(await preview(a)).id)).json()[0].id;
 const normal=dependencies.outbound;dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);return {status:429,body:Buffer.from('{}'),retryAfter:'30'};}});
 await work();const run=(await read(a.account,id)).json();expect(run).toMatchObject({executionState:'persisted',billingState:'not_provided'});expect(run.taskId).toBeUndefined();
 expect(await work()).toBe(false);expect(calls).toHaveLength(1);
 time=new Date(time.getTime()+31000);dependencies.outbound=normal;expect(await work()).toBe(true);
 expect((await read(a.account,id)).json().taskId).toBeTruthy();expect(calls.filter(r=>r.url.endsWith('/generations'))).toHaveLength(1);
});
it('lost first submission is recovered by exact original identity without another generation',async()=>{
 const a=await setup('RecoveryLostResponse','FAKE_KEY_LOST'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);if(r.url.endsWith('/generations'))throw Error('synthetic accepted response lost');expect(r.url.endsWith('/generations/lookup')).toBe(true);expect(r.idempotencyKey).toBe(calls[0].idempotencyKey);expect(r.body?.toString()).toBe(calls[0].body?.toString());return {status:200,body:Buffer.from(JSON.stringify({task:{id:'original-paid-task',status:'queued'}}))};}});
 await work();expect((await read(a.account,id)).json().executionState).toBe('submit_unknown');
 time=new Date(time.getTime()+3600000);expect(await work()).toBe(true);expect((await read(a.account,id)).json().taskId).toBe('original-paid-task');
 expect(calls.filter(r=>r.url.endsWith('/generations'))).toHaveLength(1);
});
it.each(['query','lookup','retryLookup'])('%s 429 respects the server Retry-After',async kind=>{
 const a=await setup('RecoveryQuery429','FAKE_KEY_QUERY'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();
 if(kind!=='query'){const run=(await read(a.account,id)).json();delete run.taskId;run.executionState='submit_unknown';run.queryState='polling';run.billingState='pending_reconciliation';if(kind==='retryLookup')run.retryOfCoreTaskId='original-failed-task';await f.pool.query('UPDATE workspace_video_runs SET document=$2::jsonb WHERE id=$1',[id,JSON.stringify(run)]);}
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);return {status:429,body:Buffer.from('{}'),retryAfter:'120'};}});
 const now=new Date(time);await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(now),'query');
 const row=(await f.pool.query('SELECT next_query_at FROM workspace_video_runs WHERE id=$1',[id])).rows[0];expect(row.next_query_at.getTime()-now.getTime()).toBeGreaterThanOrEqual(120000);
});
it('restart during unpaid upload resumes upload without inventing a paid unknown',async()=>{
 const a=await setup('RecoveryUploadRestart','FAKE_KEY_RESTART');await addImage(a);const id=(await confirm(a,(await preview(a)).id)).json()[0].id;
 await f.pool.query("UPDATE workspace_video_runs SET document=jsonb_set(document,'{executionState}','\"uploading\"'),lease_token=$2,lease_until=$3 WHERE id=$1",[id,randomUUID(),new Date(time.getTime()-1)]);
 const {recoverExpiredVideoTasks}=await import('../src/tasks/video-worker.js');await recoverExpiredVideoTasks(f.pool,new Date(time));
 expect((await read(a.account,id)).json()).toMatchObject({executionState:'persisted',billingState:'not_provided'});
 time=new Date(time.getTime()+10000);await work();expect(calls.filter(r=>r.url.endsWith('/generations'))).toHaveLength(1);
});
it('historical delivered save warnings clear only after verifying the stored result',async()=>{
 const a=await setup('RecoveryStoredWarning','FAKE_KEY_WARNING'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();await work();await work();
 expect((await read(a.account,id)).json().deliveryState).toBe('available_for_preview');
 await f.pool.query("UPDATE workspace_video_runs SET document=jsonb_set(document,'{issueCode}','\"RESULT_SAVE_PENDING\"'),next_delivery_at=NULL WHERE id=$1",[id]);
 const count=calls.filter(r=>r.url.endsWith('/content')).length;expect(await work()).toBe(true);expect((await read(a.account,id)).json().issueCode).toBeUndefined();expect(calls.filter(r=>r.url.endsWith('/content'))).toHaveLength(count);
});
it('historical delivered runs can reconcile an unprovided bill through the original reviewed Core task',async()=>{
 const a=await setup('RecoveryStoredBill','FAKE_KEY_BILL'),id=(await confirm(a,(await preview(a)).id)).json()[0].id;await work();await work();await work();
 await f.pool.query("UPDATE workspace_video_runs SET frozen_contract=jsonb_set(frozen_contract,'{routes,workContext}','true'),next_query_at=NULL WHERE id=$1",[id]);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);expect(r.method).toBe('GET');const taskId=new URL(r.url).pathname.split('/').pop();return {status:200,body:Buffer.from(JSON.stringify({task:{id:taskId,status:'completed',billing_state:'settled'}}))};}});
 const result=await executeNextVideoTask(f.pool,{...dependencies,assets:assets(),contracts:new Map([[base,contract]])},()=>new Date(time),'query');expect(result).toBe(true);expect((await read(a.account,id)).json().billingState).toBe('settled');expect(calls.filter(r=>r.url.endsWith('/generations'))).toHaveLength(1);
});
