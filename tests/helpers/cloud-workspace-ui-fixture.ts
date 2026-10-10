import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test as base,expect} from './account-api-ui-fixture';
import {fixture,type Account} from '../../server/tests/account-fixture';
import type {Route} from '@playwright/test';
import {ApiSecrets} from '../../server/src/security/api-secrets';
import {RestrictedOutbound,type OutboundRequest} from '../../server/src/security/outbound';
import {createHash} from 'node:crypto';
const videoBase='https://video.example.test',clipPath=join(dirname(fileURLToPath(import.meta.url)),'..','fixtures','cloud-result-clip.mp4');
const videoContract={version:'cloud-ui-video-v1',verification:'reviewed' as const,evidence:[{kind:'mock' as const,reference:'isolated fake provider only'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,chat:false,assets:false,workContext:false,continuation:false,backup:false},textModels:[],videoModels:['seedance'],videoAliases:[],videoSpecs:[{modelId:'seedance',durationSeconds:5,ratio:'16:9',resolution:'480p'}],limits:{promptBytes:12288,assetBytes:1024*1024,imageReferences:0,videoReferences:0}};
export const test=base.extend<{workspace:Awaited<ReturnType<typeof fixture>>&{account:Account;providerCalls:OutboundRequest[];holdProvider:()=>()=>void;setVideoOutcome:(outcome:'success'|'failed'|'unknown')=>void;setVideoReferenceSupport:(support:{imageReferences:number;videoReferences:number;assetUploads:boolean})=>void;setVideoSpecs:(specs:typeof videoContract.videoSpecs)=>void;videoReferenceSupport:()=>{imageReferences:number;videoReferences:number;assetUploads:boolean};switchAccount:(account:Account)=>void};workspaceRoutes:void}>({
 workspace:async({apiModel},use)=>{
  apiModel.passthrough=true;
  const root=await mkdtemp(join(tmpdir(),'aiwork-cloud-ui-'));
  const providerCalls:OutboundRequest[]=[];
  let providerGate:Promise<void>|undefined,videoOutcome:'success'|'failed'|'unknown'='success';
  const resultVideoBytes=await readFile(clipPath);
  const dependencies={secrets:new ApiSecrets({activeVersion:'ui-test',keys:new Map([['ui-test',Buffer.alloc(32,9)]])}),outbound:new RestrictedOutbound({resolve:async()=>[{address:'93.184.216.34',family:4}],request:async input=>{providerCalls.push(input);if(input.method==='POST')await providerGate;if(new URL(input.url).origin===videoBase){if(input.method==='POST'&&videoOutcome==='unknown')throw Error('FAKE_PROVIDER_TIMEOUT');if(new URL(input.url).pathname==='/v1/models')return {status:200,body:Buffer.from(JSON.stringify({data:[{id:'seedance'}]}))};if(input.url.endsWith('/content'))return {status:200,body:resultVideoBytes};if(input.method==='POST'&&input.url.endsWith('/v1/assets')){const uploaded=JSON.parse(input.body!.toString()) as {mime_type:string;data_base64:string};const content=Buffer.from(uploaded.data_base64,'base64'),digest=createHash('sha256').update(content).digest('hex'),created=Math.floor(Date.now()/1000);return {status:200,body:Buffer.from(JSON.stringify({object:'asset',id:'cloud-ui-asset-'+digest.slice(0,12),sha256:digest,bytes:content.length,mime_type:uploaded.mime_type,created_at:created,expires_at:created+3600}))};}return {status:200,body:Buffer.from(JSON.stringify({task:{id:'cloud-ui-'+createHash('sha256').update(input.apiKey).digest('hex').slice(0,12),status:input.method==='POST'?'queued':videoOutcome==='failed'?'failed':'completed',...(input.method==='GET'&&videoOutcome==='failed'?{error:{code:'video_execution_failed',billing_state:'pending',message:'FAKE_PRIVATE_LOG',upstream:{code:3003,message:'input image content[1] may contain real person'}}}:{})}}))};}if(input.method==='POST'){const body=JSON.parse(input.body!.toString());if(body.messages[0].content.startsWith('你协助整理画布')){const node=JSON.parse(body.messages[1].content).nodes[0];return {status:200,body:Buffer.from(JSON.stringify({choices:[{message:{content:JSON.stringify({message:'已整理文字建议，等待审阅',operations:[{id:'edit-1',type:'update_node',payload:{nodeId:node.id,patch:{data:{kind:'text',text:'由用户审阅后保存的 Agent 正文',referenceTokens:[]}}}}]})}}]}))};}}return {status:200,body:Buffer.from(JSON.stringify(input.method==='POST'?{choices:[{message:{content:JSON.stringify({finalPrompt:'云端 AI 优化的雨后街道',shotPlan:[],improvements:[],warnings:[],suggestedSpec:{}})}}]}:{data:[{id:'Vendor/Cloud-Text'}]}))};}})};
  const contracts=new Map([[videoBase,videoContract]]);
  const env=await fixture({workspace:true,content:true,taskWorker:true,realClock:true,apiSettings:dependencies,videoContracts:contracts,assets:{root,maxAssetBytes:1024*1024,userQuotaBytes:8*1024*1024,maxThumbnailBytes:256*1024}});const account=await env.signup('Cloud_UI_A');
  const value={...env,account,providerCalls,setVideoOutcome(outcome:'success'|'failed'|'unknown'){videoOutcome=outcome;},setVideoReferenceSupport(support:{imageReferences:number;videoReferences:number;assetUploads:boolean}){const current=contracts.get(videoBase);if(!current)throw new Error('Missing fake video contract');contracts.set(videoBase,{...current,limits:{...current.limits,imageReferences:support.imageReferences,videoReferences:support.videoReferences},routes:{...current.routes,assets:support.assetUploads}});},setVideoSpecs(specs:typeof videoContract.videoSpecs){const current=contracts.get(videoBase);if(!current)throw Error("Missing fake contract");contracts.set(videoBase,{...current,videoSpecs:specs});},videoReferenceSupport(){const current=contracts.get(videoBase);if(!current)throw new Error('Missing fake video contract');return {imageReferences:current.limits.imageReferences??0,videoReferences:current.limits.videoReferences??0,assetUploads:current.routes.assets};},holdProvider(){let release!:()=>void;providerGate=new Promise(resolve=>{release=resolve;});return ()=>{release();providerGate=undefined;};},switchAccount(next:Account){value.account=next;apiModel.session={...next.view,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};apiModel.document={...apiModel.document,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};}};value.switchAccount(account);
  try{await use(value);}finally{await env.close();if(root.startsWith(join(tmpdir(),'aiwork-cloud-ui-')))await rm(root,{recursive:true,force:true});}
 },
 workspaceRoutes:[async({context,workspace,apiGuard},use,testInfo)=>{
  void apiGuard;
  const pattern=/\/studio-api\/(projects|assets|prompts|prompt-drafts|runs|agent-conversations|agent-proposals|me\/(model-configs|video-capability|imports))(\/|\?|$)/,inFlight=new Set<Promise<unknown>>();
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
