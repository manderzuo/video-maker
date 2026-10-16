import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fixture,type Fixture,type Account} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
import {HttpError} from '../src/errors.js';
let f:Fixture,calls:OutboundRequest[],dependencies:{secrets:ApiSecrets;outbound:RestrictedOutbound},failure=false;
const output={finalPrompt:'雨后的街道，镜头缓慢前进。',shotPlan:[],improvements:['具体描述光线'],warnings:[],suggestedSpec:{}};
let semanticOutput:unknown;
beforeEach(async()=>{
 calls=[];failure=false;semanticOutput=undefined;dependencies={secrets:new ApiSecrets({activeVersion:'test',keys:new Map([['test',Buffer.alloc(32,7)]])}),outbound:new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async input=>{calls.push(input);if(failure)throw Error('FAKE_PRIVATE_PROVIDER_FAILURE');return {status:200,body:Buffer.from(JSON.stringify({id:'mock-text-result',choices:[{message:{content:JSON.stringify(semanticOutput??output)}}]}))};}})};
 f=await fixture({workspace:true,content:true,apiSettings:dependencies});
});
afterEach(async()=>{await f?.close();});
async function setup(name:string,key:string){const account=await f.signup(name);expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(account),payload:{apiBase:'https://api.example.test',model:'Vendor/Directory-Free',apiKey:key,expectedRevision:null}})).statusCode).toBe(200);const draft=await f.call('POST','/studio-api/prompt-drafts',{...f.headers(account),payload:{type:'video',userRequest:'雨后的街道',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}});expect(draft.statusCode).toBe(201);return {account,draft:draft.json()};}
async function preview(account:Account,id:string){const reply=await f.call('POST','/studio-api/prompt-drafts/'+id+'/optimization-preview',{...f.headers(account),payload:{expectedRevision:0,configRevision:1,referenceAliases:[]}});expect(reply.statusCode).toBe(201);return reply.json();}
const confirm=(account:Account,id:string,approvalId:string)=>f.call('POST','/studio-api/prompt-drafts/'+id+'/optimize',{...f.headers(account),payload:{approvalId,decision:{confirmed:true,acknowledgeTextFee:true}}});
async function work(at=new Date('2026-10-08T12:00:00Z')){const {executeNextPromptTask}=await import('../src/tasks/prompt-worker.js');return executeNextPromptTask(f.pool,dependencies,()=>new Date(at));}


it('structured prompt response preserves encrypted original and provider identity when invalid',async()=>{
 const a=await setup('RecoveryPromptJson','FAKE_KEY_JSON'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 const raw=JSON.stringify({id:'provider-paid-reply',request_id:'provider-request',choices:[{finish_reason:'stop',message:{content:'{"finalPrompt":"bad\\q"}'}}]});
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);return {status:200,body:Buffer.from(raw)};}});
 await work();const row=(await f.pool.query('SELECT document,result_snapshot FROM workspace_tasks WHERE id=$1',[task.json().id])).rows[0];
 expect(row.document).toMatchObject({executionState:'failed_confirmed',billingState:'pending_reconciliation',errorCode:'INVALID_UPSTREAM_RESULT'});
 expect(row.result_snapshot).toMatchObject({providerRequestId:'provider-request',responseStatus:200});expect(row.result_snapshot.sealedResponse).toBeTruthy();
 expect(JSON.stringify(row.result_snapshot)).not.toContain('bad');
 const sent=JSON.parse(calls[0].body!.toString());expect(sent.tools[0].function.name).toBe('submit_prompt_optimization');
});
it('truncated completion cannot become a successful prompt result',async()=>{
 const a=await setup('RecoveryPromptLength','FAKE_KEY_LENGTH'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);return {status:200,body:Buffer.from(JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(output)}}]}))};}});
 await work();expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('failed_confirmed');
});
it('a native structured tool result is saved without textual JSON extraction',async()=>{
 const a=await setup('RecoveryPromptTool','FAKE_KEY_TOOL'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);return {status:200,body:Buffer.from(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'call-fixture',type:'function',function:{name:'submit_prompt_optimization',arguments:JSON.stringify(output)}}]}}]}))};}});
 await work();expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('succeeded');
});
it.each([false,true])('lost prompt response is recovered from the original Core request and settles the exact bill; damaged snapshot=%s',async damaged=>{
 const a=await setup('RecoveryPromptLost','FAKE_KEY_LOST'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async r=>{calls.push(r);if(r.url.endsWith('/chat/completions'))throw Error('response lost');expect(r.url.endsWith('/chat/completions/lookup')).toBe(true);expect(r.idempotencyKey).toBe(calls[0].idempotencyKey);expect(r.body?.toString()).toBe(calls[0].body?.toString());return {status:200,body:Buffer.from(JSON.stringify({request_id:'original-request',status:'ready',billing_state:'settled',actual_microcredits:125600,result:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}}))};}});
 await work();expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('response_unknown');
 if(damaged)await f.pool.query('UPDATE workspace_tasks SET result_snapshot=$2::jsonb WHERE id=$1',[task.json().id,JSON.stringify({kind:'prompt-call-response-v2',sealedResponse:{keyVersion:'test',nonce:'bad',ciphertext:'bad',tag:'bad'}})]);
 const {reconcileNextPromptTask}=await import('../src/tasks/prompt-worker.js');expect(await reconcileNextPromptTask(f.pool,dependencies,()=>new Date('2026-10-08T13:00:00Z'))).toBe(true);
 expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json()).toMatchObject({executionState:'succeeded',billingState:'settled'});expect(calls.filter(r=>r.url.endsWith('/chat/completions'))).toHaveLength(1);
});
