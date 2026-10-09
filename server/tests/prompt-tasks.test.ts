import {afterEach,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fixture,type Fixture,type Account} from './account-fixture.js';
import {ApiSecrets} from '../src/security/api-secrets.js';
import {RestrictedOutbound,type OutboundRequest} from '../src/security/outbound.js';
let f:Fixture,calls:OutboundRequest[],dependencies:{secrets:ApiSecrets;outbound:RestrictedOutbound},failure=false;
const output={finalPrompt:'雨后的街道，镜头缓慢前进。',shotPlan:[],improvements:['具体描述光线'],warnings:[],suggestedSpec:{}};
beforeEach(async()=>{
 calls=[];failure=false;dependencies={secrets:new ApiSecrets({activeVersion:'test',keys:new Map([['test',Buffer.alloc(32,7)]])}),outbound:new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async input=>{calls.push(input);if(failure)throw Error('FAKE_PRIVATE_PROVIDER_FAILURE');return {status:200,body:Buffer.from(JSON.stringify({id:'mock-text-result',choices:[{message:{content:JSON.stringify(output)}}]}))};}})};
 f=await fixture({workspace:true,content:true,apiSettings:dependencies});
});
afterEach(async()=>{await f?.close();});
async function setup(name:string,key:string){const account=await f.signup(name);expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(account),payload:{apiBase:'https://api.example.test',model:'Vendor/Directory-Free',apiKey:key,expectedRevision:null}})).statusCode).toBe(200);const draft=await f.call('POST','/studio-api/prompt-drafts',{...f.headers(account),payload:{type:'video',userRequest:'雨后的街道',sceneId:'text',requestedSpec:{},audioPlan:'',lockedConstraints:[],references:[],ruleVersion:'studio-video-rules-v1',idempotencyKey:randomUUID()}});expect(draft.statusCode).toBe(201);return {account,draft:draft.json()};}
async function preview(account:Account,id:string){const reply=await f.call('POST','/studio-api/prompt-drafts/'+id+'/optimization-preview',{...f.headers(account),payload:{expectedRevision:0,configRevision:1,referenceAliases:[]}});expect(reply.statusCode).toBe(201);return reply.json();}
const confirm=(account:Account,id:string,approvalId:string)=>f.call('POST','/studio-api/prompt-drafts/'+id+'/optimize',{...f.headers(account),payload:{approvalId,decision:{confirmed:true,acknowledgeTextFee:true}}});
async function work(){const {executeNextPromptTask}=await import('../src/tasks/prompt-worker.js');return executeNextPromptTask(f.pool,dependencies,()=>new Date('2026-10-08T12:00:00Z'));}
it('persists A/B tasks before sending and uses each frozen owner key without requiring catalog membership',async()=>{
 const a=await setup('PromptTask_A','FAKE_KEY_A'),b=await setup('PromptTask_B','FAKE_KEY_B');
 const pa=await preview(a.account,a.draft.id),pb=await preview(b.account,b.draft.id);
 const ta=await confirm(a.account,a.draft.id,pa.id),tb=await confirm(b.account,b.draft.id,pb.id);expect(ta.statusCode).toBe(202);expect(tb.statusCode).toBe(202);expect(calls).toHaveLength(0);
 await Promise.all([work(),work(),work()]);expect(calls.map(call=>call.apiKey).sort()).toEqual(['FAKE_KEY_A','FAKE_KEY_B']);expect(calls.every(call=>call.url==='https://api.example.test/v1/chat/completions')).toBe(true);
 for(const [owner,task]of [[a,ta],[b,tb]] as const){const read=await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(owner.account));expect(read.statusCode).toBe(200);expect(read.json()).toMatchObject({executionState:'succeeded',kind:'prompt-optimize'});expect(read.body).not.toContain('FAKE_KEY');const draft=(await f.call('GET','/studio-api/prompt-drafts/'+owner.draft.id,f.headers(owner.account))).json();expect(draft.resultVersions[0]).toMatchObject({origin:'ai',sourceRevision:0,finalPrompt:output.finalPrompt,promptRunId:task.json().id});}
 expect((await f.call('GET','/studio-api/runs/'+ta.json().id,f.headers(b.account))).statusCode).toBe(404);
});
it('replays confirmation as the same task and keeps the prior key/model when config rotates after confirmation',async()=>{
 const a=await setup('PromptTask_Rotate','FAKE_OLD_KEY'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 expect((await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a.account),payload:{apiBase:'https://api.example.test',model:'Vendor/New',apiKey:'FAKE_NEW_KEY',expectedRevision:1}})).statusCode).toBe(200);
 const retry=await confirm(a.account,a.draft.id,p.id);expect(retry.statusCode).toBe(202);expect(retry.json().id).toBe(task.json().id);await work();await work();expect(calls).toHaveLength(1);expect(calls[0].apiKey).toBe('FAKE_OLD_KEY');expect(JSON.parse(calls[0].body!.toString()).model).toBe('Vendor/Directory-Free');
});
it('invalidates a preview on config or draft change and never accepts a foreign preview or caller ownership/key',async()=>{
 const a=await setup('PromptTask_Stale','FAKE_KEY_A'),b=await setup('PromptTask_Foreign','FAKE_KEY_B'),p=await preview(a.account,a.draft.id);
 expect((await confirm(b.account,b.draft.id,p.id)).statusCode).toBe(404);
 expect((await f.call('POST','/studio-api/prompt-drafts/'+a.draft.id+'/optimize',{...f.headers(a.account),payload:{approvalId:p.id,decision:{confirmed:true,acknowledgeTextFee:true},apiKey:'FAKE_FORGED'}})).statusCode).toBe(400);
 await f.call('PATCH','/studio-api/me/model-configs/text',{...f.headers(a.account),payload:{apiBase:'https://api.example.test',model:'Changed',expectedRevision:1}});expect((await confirm(a.account,a.draft.id,p.id)).statusCode).toBe(409);expect(calls).toHaveLength(0);
});
it('records ambiguous transport outcomes and never automatically sends the paid request a second time',async()=>{
 const a=await setup('PromptTask_Unknown','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);failure=true;await work();await work();expect(calls).toHaveLength(1);
 const read=await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account));expect(read.json()).toMatchObject({executionState:'response_unknown',billingState:'pending_reconciliation'});expect(read.body).not.toContain('FAKE_PRIVATE');
 expect((await confirm(a.account,a.draft.id,p.id)).json().id).toBe(task.json().id);expect((await f.call('POST','/studio-api/prompt-drafts/'+a.draft.id+'/optimization-preview',{...f.headers(a.account),payload:{expectedRevision:0,configRevision:1,referenceAliases:[]}})).json().priorUnknownRunIds).toEqual([task.json().id]);
});
it('appends the result to the current draft without overwriting newer input or losing the frozen input snapshot',async()=>{
 const a=await setup('PromptTask_Input','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.call('PATCH','/studio-api/prompt-drafts/'+a.draft.id,{...f.headers(a.account),payload:{expectedRevision:0,userRequest:'用户在等待时修改的创意'}});await work();const draft=(await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id,f.headers(a.account))).json();expect(draft.userRequest).toBe('用户在等待时修改的创意');expect(draft.resultVersions[0].sourceRevision).toBe(0);expect((await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id+'/revisions/0',f.headers(a.account))).json().userRequest).toBe('雨后的街道');
});
it('keeps a received response durable if saving the draft fails, then finishes without resending',async()=>{
 const a=await setup('PromptTask_SaveRetry','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.pool.query("CREATE FUNCTION reject_ai_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER reject_ai_version BEFORE INSERT ON workspace_content_versions FOR EACH ROW EXECUTE FUNCTION reject_ai_version()");
 await work();expect(calls).toHaveLength(1);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('response_received');
 await f.pool.query('DROP TRIGGER reject_ai_version ON workspace_content_versions');await work();expect(calls).toHaveLength(1);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('succeeded');
});
it('turns an expired sending lease into an unknown outcome without replaying after worker restart',async()=>{
 const a=await setup('PromptTask_Restart','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.pool.query("UPDATE workspace_tasks SET document=jsonb_set(document,'{executionState}','\"sending\"'),lease_until=$1",[new Date('2026-10-08T11:00:00Z')]);const {recoverExpiredPromptTasks}=await import('../src/tasks/prompt-worker.js');await recoverExpiredPromptTasks(f.pool,new Date('2026-10-08T12:00:00Z'));await work();expect(calls).toHaveLength(0);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json()).toMatchObject({executionState:'response_unknown',billingState:'pending_reconciliation'});
});
it('runs the durable task in the background even when no browser waits for the response',async()=>{
 const a=await setup('PromptTask_Background','FAKE_KEY_A'),p=await preview(a.account,a.draft.id);expect((await confirm(a.account,a.draft.id,p.id)).statusCode).toBe(202);
 const {startPromptWorker}=await import('../src/tasks/prompt-worker.js');const worker=startPromptWorker(f.pool,dependencies,()=>new Date('2026-10-08T12:00:00Z'));
 try{await expect.poll(async()=>calls.length,{timeout:3000}).toBe(1);await expect.poll(async()=>(await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id,f.headers(a.account))).json().resultVersions.length,{timeout:3000}).toBe(1);}finally{await worker.stop();}
});
it('exports the prompt task and its result history, importing it as read-only history without another model call',async()=>{
 const a=await setup('PromptTask_Package','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 const project=(await f.call('POST','/studio-api/projects',{...f.headers(a.account),payload:{title:'任务历史项目'}})).json();await f.call('PATCH','/studio-api/prompt-drafts/'+a.draft.id,{...f.headers(a.account),payload:{expectedRevision:0,sourceProjectId:project.id}});await work();
 const exported=await f.call('GET','/studio-api/projects/'+project.id+'/export',f.headers(a.account));expect(exported.statusCode).toBe(200);const data=exported.json();expect(data.taskHistory).toHaveLength(1);expect(data.taskHistory[0].id).toBe(task.json().id);expect(exported.body).not.toContain('FAKE_KEY');
 const imported=await f.call('POST','/studio-api/projects/import',{...f.headers(a.account),payload:{data,assets:{},idempotencyKey:randomUUID()}});expect(imported.statusCode).toBe(201);const copy=await f.call('GET','/studio-api/projects/'+imported.json().project.id+'/export',f.headers(a.account));expect(copy.statusCode).toBe(200);expect(copy.json().taskHistory[0]).toMatchObject({historical:true,executionState:'succeeded'});expect(copy.json().taskHistory[0].id).not.toBe(task.json().id);expect(copy.json().content[0].document.resultVersions[0].promptRunId).toBe(copy.json().taskHistory[0].id);await work();expect(calls).toHaveLength(1);
});
