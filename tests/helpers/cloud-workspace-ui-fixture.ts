import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test as base,expect} from './account-api-ui-fixture';
import {fixture,type Account} from '../../server/tests/account-fixture';
import type {Route} from '@playwright/test';
import {ApiSecrets} from '../../server/src/security/api-secrets';
import {RestrictedOutbound,type OutboundRequest} from '../../server/src/security/outbound';
import {createHash} from 'node:crypto';
const videoBase='https://video.example.test',videoBytes=Buffer.from('000000186674797069736F6D0000020069736F6D69736F32','hex');
const videoContract={version:'cloud-ui-video-v1',verification:'reviewed' as const,evidence:[{kind:'mock' as const,reference:'isolated fake provider only'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,chat:false,assets:false,workContext:false,continuation:false,backup:false},textModels:[],videoModels:['seedance'],videoAliases:[],videoSpecs:[{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}],limits:{promptBytes:12288,imageReferences:0,videoReferences:0}};
export const test=base.extend<{workspace:Awaited<ReturnType<typeof fixture>>&{account:Account;providerCalls:OutboundRequest[];holdProvider:()=>()=>void;setVideoOutcome:(outcome:'success'|'failed'|'unknown')=>void;switchAccount:(account:Account)=>void};workspaceRoutes:void}>({
 workspace:async({apiModel},use)=>{
  const root=await mkdtemp(join(tmpdir(),'aiwork-cloud-ui-'));
  const providerCalls:OutboundRequest[]=[];
  let providerGate:Promise<void>|undefined,videoOutcome:'success'|'failed'|'unknown'='success';
  const dependencies={secrets:new ApiSecrets({activeVersion:'ui-test',keys:new Map([['ui-test',Buffer.alloc(32,9)]])}),outbound:new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async input=>{providerCalls.push(input);if(input.method==='POST')await providerGate;if(new URL(input.url).origin===videoBase){if(input.method==='POST'&&videoOutcome==='unknown')throw Error('FAKE_PROVIDER_TIMEOUT');if(input.url.endsWith('/content'))return {status:200,body:videoBytes};return {status:200,body:Buffer.from(JSON.stringify({task:{id:'cloud-ui-'+createHash('sha256').update(input.apiKey).digest('hex').slice(0,12),status:input.method==='POST'?'queued':videoOutcome==='failed'?'failed':'completed',...(input.method==='GET'&&videoOutcome==='failed'?{error:{code:'video_execution_failed',billing_state:'pending',message:'FAKE_PRIVATE_LOG',upstream:{code:3003,message:'input image content[1] may contain real person'}}}:{})}}))};}return {status:200,body:Buffer.from(JSON.stringify(input.method==='POST'?{choices:[{message:{content:JSON.stringify({finalPrompt:'云端 AI 优化的雨后街道',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{}})}}]}:{data:[{id:'Vendor/Cloud-Text'}]}))};}})};
  const env=await fixture({workspace:true,content:true,taskWorker:true,realClock:true,apiSettings:dependencies,videoContracts:new Map([[videoBase,videoContract]]),assets:{root,maxAssetBytes:1024*1024,userQuotaBytes:8*1024*1024,maxThumbnailBytes:256*1024}});const account=await env.signup('Cloud_UI_A');
  const value={...env,account,providerCalls,setVideoOutcome(outcome:'success'|'failed'|'unknown'){videoOutcome=outcome;},holdProvider(){let release!:()=>void;providerGate=new Promise(resolve=>{release=resolve;});return ()=>{release();providerGate=undefined;};},switchAccount(next:Account){value.account=next;apiModel.session={...next.view,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};apiModel.document={...apiModel.document,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};}};value.switchAccount(account);
  try{await use(value);}finally{await env.close();if(root.startsWith(join(tmpdir(),'aiwork-cloud-ui-')))await rm(root,{recursive:true,force:true});}
 },
 workspaceRoutes:[async({context,workspace,apiGuard},use,testInfo)=>{
  void apiGuard;
  const pattern=/\/studio-api\/(projects|assets|prompts|prompt-drafts|runs|me\/(model-configs|video-capability))(\/|\?|$)/,inFlight=new Set<Promise<unknown>>();
  const handle=async(route:Route)=>{
   const request=route.request(),url=new URL(request.url()),headers=request.headers();
   if(url.origin!=='http://127.0.0.1:4310')return route.abort();
   const response=await workspace.app.inject({method:request.method() as 'GET'|'HEAD'|'POST'|'PATCH'|'DELETE'|'PUT',url:url.pathname+url.search,payload:request.postDataBuffer()??undefined,headers:{cookie:workspace.account.cookie,...(headers['x-workspace-context']?{'x-workspace-context':headers['x-workspace-context']}:{}),...(headers['x-csrf-token']?{'x-csrf-token':headers['x-csrf-token']}:{}),...(headers['content-type']?{'content-type':headers['content-type']}:{}),...(request.method()==='GET'||request.method()==='HEAD'?{}:{origin:'https://studio.test'})}});
   await route.fulfill({status:response.statusCode,body:response.rawPayload,headers:{'content-type':String(response.headers['content-type']??'application/json'),'cache-control':'no-store'}});
  };
  const handler=async(route:Route)=>{const pending=handle(route);inFlight.add(pending);try{await pending;}finally{inFlight.delete(pending);}};
  await context.route(pattern,handler);
  try{await use();}finally{await context.unroute(pattern,handler);await Promise.all([...inFlight]);}
  testInfo.annotations.push({type:'studio:validation-scope',description:'Cloud UI + real isolated PostgreSQL/files through in-process route adapter; synthetic authentication, HTTP loopback; not secure-cookie/trusted-HTTPS acceptance'});
 },{auto:true}]
});
export {expect};
