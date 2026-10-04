import {afterEach,it,expect} from 'vitest';
import {createCoreClient,createTextClient} from '../../src/adapters/core/http-client';
import {sendCoreText} from '../../src/adapters/core/text';
import {classifyCoreError} from '../../src/adapters/core/contracts';
import * as fingerprint from '../../src/application/runs/fingerprint';
import {clearSessionCredentials,setSessionCredential,withCredential} from '../../src/security/credential-session';
import {f} from '../helpers/fixtures';
import {textFailureMessage} from '../../src/ui/text-failure-message';
it('saved receipts retain safe credential and rate-limit reasons without a category or provider message',()=>{
 expect(textFailureMessage({httpStatus:401,errorCode:'invalid_api_key'})).toBe('文字服务失败（HTTP 401）：文字凭据未通过验证，请重新输入当前服务的 Key。');
 expect(textFailureMessage({httpStatus:429,errorCode:'unknown_provider_type',message:'fake-private-provider-content'})).toBe('文字服务失败（HTTP 429）：服务限流，请核对用量后再决定是否重试。');
 expect(textFailureMessage({httpStatus:402,message:'private-provider-detail'})).toBe('文字服务失败（HTTP 402）：文字额度或用量受限，请核对服务商控制台。');
 expect(textFailureMessage({httpStatus:400,errorCode:'text_session_required',message:'fake-private-provider-content'})).toContain('服务需要稳定会话标识');
 expect(textFailureMessage({httpStatus:200,message:'fake-private-provider-content'})).not.toContain('fake-private-provider-content');
});
const model='deepseek-v4.1-flash',sessionId='studio-prompt-'+'a'.repeat(64);
function client(){
 const profile=f.connection({id:'qa-go',proxyBase:'/text-api/registered/qa-go',originSnapshot:'https://opencode.ai/zen/go',contractVersion:'openai-compatible-text-v1'}),binding={id:'qa-text-binding',connectionId:profile.id,originSnapshot:profile.originSnapshot,kind:'text-api' as const,createdAt:1};
 setSessionCredential(binding.id,'fake-unit-key');const requests:{url:string;init?:RequestInit}[]=[];
 const value=createTextClient(profile,{binding,withCredential},{registry:[profile],browserOrigin:'http://127.0.0.1:4179',fetch:async(url,init)=>{requests.push({url:String(url),init});return new Response(JSON.stringify({id:'qa-response',choices:[{message:{content:'原创本地候选'}}]}));}});
 return {value,requests,capability:f.caps({contractVersion:profile.contractVersion,textModels:[model],videoModels:[],videoSpecs:[]})};
}
afterEach(()=>clearSessionCredentials());
it('Go chat forwards a stable conversation header while preserving exact approved request bytes',async()=>{
 const h=client(),body=JSON.stringify({model,stream:false,messages:[{role:'system',content:'仅文字'},{role:'user',content:'原创输入'}]});
 const reply=await sendCoreText(h.value,h.capability,body,'qa-confirmed',undefined,sessionId);
 expect(reply).toMatchObject({ok:true,value:{content:'原创本地候选'}});expect(h.requests).toHaveLength(1);
 expect(h.requests[0].init?.body).toBe(body);expect(new Headers(h.requests[0].init?.headers).get('x-opencode-session')).toBe(sessionId);
 expect(body).not.toContain('fake-unit-key');expect(body).not.toContain(sessionId);
});
it('Go chat with no conversation session is rejected locally before fetch',async()=>{
 const h=client(),reply=await h.value.requestJson('POST','/v1/chat/completions',{model,messages:[],stream:false},{idempotencyKey:'qa-no-session'});
 expect(reply).toMatchObject({ok:false,error:{errorCode:'text_session_required',submissionOutcome:'not_sent'}});expect(h.requests).toHaveLength(0);
});
it.each(['unsafe space','a'.repeat(129)])('an invalid text session %s is rejected before fetch',async textSessionId=>{
 const h=client(),reply=await h.value.requestJson('POST','/v1/chat/completions',{model,messages:[],stream:false},{idempotencyKey:'qa-invalid-session',textSessionId});
 expect(reply).toMatchObject({ok:false,error:{errorCode:'text_session_invalid',submissionOutcome:'not_sent'}});expect(h.requests).toHaveLength(0);
});
it('the independent Chat client still denies Responses and video operations',async()=>{
 const h=client();for(const path of ['/v1/responses','/v1/videos/generations'])expect((await h.value.requestJson('POST',path,{model},{idempotencyKey:'qa-denied',textSessionId:sessionId})).ok).toBe(false);expect(h.requests).toHaveLength(0);
});
it('Core video transport never receives independent text session metadata',async()=>{
 const profile=f.connection(),binding={id:'core-binding',connectionId:profile.id,originSnapshot:profile.originSnapshot,kind:'core-user' as const,createdAt:1};setSessionCredential(binding.id,'fake-core-key');const requests:RequestInit[]=[];
 const core=createCoreClient(profile,{binding,withCredential},{registry:[profile],browserOrigin:'http://127.0.0.1:4179',fetch:async(_url,init)=>{requests.push(init!);return new Response('{}');}});
 await core.requestJson('POST','/v1/videos/generations',{model:'fake-video-only'},{idempotencyKey:'qa-video'});expect(requests).toHaveLength(1);expect(new Headers(requests[0].headers).has('x-opencode-session')).toBe(false);
});
it('a known top-level Go rejection remains specific without asserting billing certainty',()=>{
 expect(classifyCoreError(400,{type:'MissingSessionID',message:'untrusted raw message'})).toMatchObject({httpStatus:400,errorCode:'text_session_required',submissionOutcome:'unknown'});
});
it('provider authentication and region errors have safe diagnostic codes',()=>{
 expect(classifyCoreError(401,{type:'AuthError',message:'secret echo'}).errorCode).toBe('text_authentication_failed');expect(classifyCoreError(403,{type:'RegionError'}).errorCode).toBe('text_region_restricted');
});
it('arbitrary provider text never becomes a diagnostic field',()=>{
 const failure=classifyCoreError(400,{type:'unknown-private-value',message:'private prompt',code:'private-token'});expect(failure.errorCode).toBe('core_http_error');expect(JSON.stringify(failure)).not.toContain('private');
});
it('text conversation identities are stable per draft and separated by connection, scope and conversation',async()=>{
 const module=fingerprint as typeof fingerprint&{createTextSessionId:(scope:'prompt'|'agent',connectionId:string,conversationId:string)=>Promise<string>};expect(module.createTextSessionId).toBeTypeOf('function');
 const first=await module.createTextSessionId('prompt','connection-1','draft-1');expect(first).toMatch(/^studio-prompt-[a-f0-9]{64}$/);expect(await module.createTextSessionId('prompt','connection-1','draft-1')).toBe(first);
 for(const next of [await module.createTextSessionId('prompt','connection-2','draft-1'),await module.createTextSessionId('prompt','connection-1','draft-2'),await module.createTextSessionId('agent','connection-1','draft-1')])expect(next).not.toBe(first);
 expect(first).not.toContain('connection-1');expect(first).not.toContain('draft-1');
});
