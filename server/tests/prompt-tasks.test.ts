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
it.each([false,true])('lets one model request interpret the full creative input and preserves semantic warnings: %s',warning=>{
 return (async()=>{
  const a=await setup('Semantic_'+warning,'FAKE_SEMANTIC_KEY'),requestedSpec={durationSeconds:15,ratio:'9:16',resolution:'480p'};
  const prompt='【时间轴】1.2秒角色甲进入；9.6秒台词结束。画外音：“等我20秒。”原片画幅16:9。'+(warning?'第20秒人物乙入画。':'');
  const userRequest=JSON.stringify({任务:'针对原视频修正错误',当前完整提示词:prompt,本次修正要求:'保持场景及人物运动连续。'});
  expect((await f.call('PATCH','/studio-api/prompt-drafts/'+a.draft.id,{...f.headers(a.account),payload:{expectedRevision:0,userRequest,requestedSpec}})).statusCode).toBe(200);
  const response=await f.call('POST','/studio-api/prompt-drafts/'+a.draft.id+'/optimization-preview',{...f.headers(a.account),payload:{expectedRevision:1,configRevision:1,referenceAliases:[]}});
  expect(response.statusCode).toBe(201);expect(calls).toHaveLength(0);
  semanticOutput={finalPrompt:'保持人物运动和场景连续的完整候选正文。',shotPlan:[{id:'one',durationSeconds:15,prompt:'完整镜头',startState:'人物走近',endState:'人物停下'}],improvements:[],warnings:warning?['第20秒入画超过已选15秒，请确认时长或入画时间。']:[],suggestedSpec:requestedSpec};
  const task=await confirm(a.account,a.draft.id,response.json().id);expect(task.statusCode).toBe(202);await work();await work();expect(calls).toHaveLength(1);
  const request=JSON.parse(calls[0].body!.toString()),content=JSON.parse(request.messages[1].content);
  expect(content.userRequest).toBe(userRequest);expect(content.requestedSpec).toEqual(requestedSpec);expect(content.semanticReview.performedBy).toBe('model');
  const draft=(await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id,f.headers(a.account))).json(),version=draft.resultVersions[0];
  expect(draft.userRequest).toBe(userRequest);expect(version).toMatchObject({origin:'ai',sourceRevision:1,validationState:warning?'needs_review':'valid'});
  if(warning)expect(version.warnings).toContain('第20秒入画超过已选15秒，请确认时长或入画时间。');else expect(version.warnings).toEqual([]);
  expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('succeeded');
 })();
});
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
it('keeps a slow in-flight prompt lease alive beyond the old two-minute reply limit',async()=>{
 const a=await setup('PromptTask_Slow','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 let finish!:(value:{status:number;body:Buffer})=>void,started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:input=>{calls.push(input);started();return new Promise(resolve=>{finish=resolve;});}});
 const reply={status:200,body:Buffer.from(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}))};vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});const pending=work();
 try{await ready;await vi.advanceTimersByTimeAsync(180000);
  const {recoverExpiredPromptTasks}=await import('../src/tasks/prompt-worker.js');await recoverExpiredPromptTasks(f.pool,new Date('2026-10-08T12:03:00Z'));
  const sending=(await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json();
  finish(reply);await pending;
  expect(calls[0].signal.aborted).toBe(false);expect(sending.executionState).toBe('sending');expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('succeeded');expect(calls).toHaveLength(1);
 }finally{finish?.(reply);await pending;vi.useRealTimers();}
});
it.each(['UPSTREAM_TIMEOUT','UPSTREAM_TOO_LARGE','INVALID_UPSTREAM_RESULT'])('retains a safe specific diagnostic without changing old clients or resending: %s',async cause=>{
 const a=await setup('Diagnostic_'+cause.slice(0,15),'FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);
 dependencies.outbound=new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async input=>{calls.push(input);if(cause==='INVALID_UPSTREAM_RESULT')return {status:200,body:Buffer.from('FAKE_PRIVATE_MALFORMED_REPLY')};throw new HttpError(504,cause);}});
 await work();await work();const read=await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account));
 expect(read.json()).toMatchObject({executionState:cause==='INVALID_UPSTREAM_RESULT'?'failed_confirmed':'response_unknown',billingState:'pending_reconciliation',errorCode:cause==='INVALID_UPSTREAM_RESULT'?cause:'UPSTREAM_FAILED'});
 const stored=await f.pool.query('SELECT result_snapshot FROM workspace_tasks WHERE id=$1',[task.json().id]);expect(stored.rows[0].result_snapshot).toMatchObject(cause==='INVALID_UPSTREAM_RESULT'?{kind:'prompt-call-response-v2',cause,responseStatus:200}:{kind:'prompt-call-failure',cause,timeoutMs:300000});if(cause==='INVALID_UPSTREAM_RESULT')expect(stored.rows[0].result_snapshot.sealedResponse).toBeTruthy();expect(JSON.stringify(stored.rows[0])).not.toContain('FAKE_');expect(calls).toHaveLength(1);
});
it('appends the result to the current draft without overwriting newer input or losing the frozen input snapshot',async()=>{
 const a=await setup('PromptTask_Input','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.call('PATCH','/studio-api/prompt-drafts/'+a.draft.id,{...f.headers(a.account),payload:{expectedRevision:0,userRequest:'用户在等待时修改的创意'}});await work();const draft=(await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id,f.headers(a.account))).json();expect(draft.userRequest).toBe('用户在等待时修改的创意');expect(draft.resultVersions[0].sourceRevision).toBe(0);expect((await f.call('GET','/studio-api/prompt-drafts/'+a.draft.id+'/revisions/0',f.headers(a.account))).json().userRequest).toBe('雨后的街道');
});
it('keeps a received response durable if saving the draft fails, then finishes without resending',async()=>{
 const a=await setup('PromptTask_SaveRetry','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.pool.query("CREATE FUNCTION reject_ai_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER reject_ai_version BEFORE INSERT ON workspace_content_versions FOR EACH ROW EXECUTE FUNCTION reject_ai_version()");
 await work();expect(calls).toHaveLength(1);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('response_received');
 const retry=(await f.pool.query('SELECT next_finalize_at,finalize_attempts,finalize_error FROM workspace_tasks WHERE id=$1',[task.json().id])).rows[0];expect(retry).toMatchObject({finalize_attempts:1,finalize_error:'RESULT_SAVE_PENDING'});await f.pool.query('DROP TRIGGER reject_ai_version ON workspace_content_versions');expect(await work()).toBe(false);await work(retry.next_finalize_at);expect(calls).toHaveLength(1);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json().executionState).toBe('succeeded');
});
it('turns an expired sending lease into an unknown outcome without replaying after worker restart',async()=>{
 const a=await setup('PromptTask_Restart','FAKE_KEY_A'),p=await preview(a.account,a.draft.id),task=await confirm(a.account,a.draft.id,p.id);expect(task.statusCode).toBe(202);
 await f.pool.query("UPDATE workspace_tasks SET document=jsonb_set(document,'{executionState}','\"sending\"'),lease_until=$1",[new Date('2026-10-08T11:00:00Z')]);const {recoverExpiredPromptTasks}=await import('../src/tasks/prompt-worker.js');await recoverExpiredPromptTasks(f.pool,new Date('2026-10-08T12:00:00Z'));await work();expect(calls).toHaveLength(0);expect((await f.call('GET','/studio-api/runs/'+task.json().id,f.headers(a.account))).json()).toMatchObject({executionState:'response_unknown',billingState:'pending_reconciliation'});
});
it('isolates a persistent finalization failure and saves a different user response without resending either call',async()=>{
 const a=await setup('Poison_A','FAKE_KEY_A'),b=await setup('Poison_B','FAKE_KEY_B'),first=await confirm(a.account,a.draft.id,(await preview(a.account,a.draft.id)).id),second=await confirm(b.account,b.draft.id,(await preview(b.account,b.draft.id)).id);
 // Reject only updates to the first existing draft; real savepoint rollback
 // must undo its partial result append while the second user's write succeeds.
 await f.pool.query("CREATE FUNCTION reject_one_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.document->>'userRequest'='poison this result' THEN RAISE EXCEPTION 'synthetic private detail'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_one_result BEFORE UPDATE ON workspace_content FOR EACH ROW EXECUTE FUNCTION reject_one_result()");
 await f.pool.query("UPDATE workspace_content SET document=jsonb_set(document,'{userRequest}','\"poison this result\"') WHERE id=$1",[a.draft.id]);
 // Ensure the poisoned task is the first selected regardless of UUID order.
 await f.pool.query('UPDATE workspace_tasks SET created_at=$2 WHERE id=$1',[first.json().id,new Date('2026-10-08T11:59:59Z')]);
 await work();await work();
 expect(calls).toHaveLength(2);expect((await f.call('GET','/studio-api/runs/'+first.json().id,f.headers(a.account))).json().executionState).toBe('response_received');expect((await f.call('GET','/studio-api/runs/'+second.json().id,f.headers(b.account))).json().executionState).toBe('succeeded');
 const failed=(await f.pool.query('SELECT result_snapshot,finalize_attempts,next_finalize_at,finalize_error FROM workspace_tasks WHERE id=$1',[first.json().id])).rows[0];expect(failed).toMatchObject({result_snapshot:{kind:'prompt-call-response-v2',candidate:output},finalize_attempts:1,finalize_error:'RESULT_SAVE_PENDING'});expect(failed.result_snapshot.sealedResponse).toBeTruthy();expect(JSON.stringify(failed)).not.toContain('synthetic private');
 await work(failed.next_finalize_at);expect(calls).toHaveLength(2);expect((await f.pool.query('SELECT finalize_attempts FROM workspace_tasks WHERE id=$1',[first.json().id])).rows[0].finalize_attempts).toBe(2);
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
