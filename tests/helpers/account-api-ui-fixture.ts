import {test as base,expect} from '@playwright/test';
import {defaultPreferences} from '../../src/features/settings/preferences-store';
import type {UserDocumentView} from '../../src/infrastructure/api/user-document';
import type {ModelConfig} from '../../src/features/settings/api-settings-client';
import {createAccountNetworkGuard} from './account-network-guard';
export const accountApiUiOrigin='http://127.0.0.1:4310';
const session={user:{id:'11111111-1111-4111-8111-111111111111',username:'Fake_Task3_A'},contextId:'a'.repeat(43),csrfToken:'b'.repeat(43),onboardingCompletedAt:null as string|null};
function createModel(){
 const {lastVisitedPage:_,defaultTextModel:__,defaultVideoModel:___,...preferences}=defaultPreferences;void _;void __;void ___;
 return {session:{...session,user:{...session.user}},document:{revision:0,onboardingCompletedAt:null,lastVisitedPage:'/projects',preferences:{...preferences}} as UserDocumentView,configs:[] as ModelConfig[],configWrites:[] as {channel:string;input:Record<string,unknown>}[],probes:[] as {channel:string;input:Record<string,unknown>}[],onboardingWrites:[] as unknown[],catalogStatus:'ready',connection:'verified',models:['Vendor/Listed'],failure:undefined as 'denied'|'unavailable'|undefined,passthrough:false,probeGate:undefined as Promise<void>|undefined,conflictNextSave:false,failNextSave:false,failNextList:false,conflictNextOnboarding:false,failNextDocumentRead:false};
}
export const test=base.extend<{apiModel:ReturnType<typeof createModel>;apiGuard:void}>({
 apiModel:async({},use)=>{await use(createModel());},
 apiGuard:[async({context,apiModel},use,testInfo)=>{
  const guard=createAccountNetworkGuard(accountApiUiOrigin),unexpected:string[]=[];await guard.install(context);
  await context.route('**/studio-api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method(),headers=request.headers();
   if(url.origin!==accountApiUiOrigin)return route.abort('blockedbyclient');
   const reply=(json:unknown,status=200)=>route.fulfill({status,json});
   if(url.pathname==='/studio-api/session'&&method==='GET')return reply(apiModel.session);
   if(headers['x-workspace-context']!==apiModel.session.contextId)return reply({code:'SESSION_CHANGED'},409);
   if(method!=='GET'&&headers['x-csrf-token']!==apiModel.session.csrfToken)return reply({code:'CSRF_INVALID'},403);
   if(url.pathname==='/studio-api/projects'&&method==='GET')return reply([]);
   if(url.pathname==='/studio-api/me/document'){
    if(method==='GET'){if(apiModel.failNextDocumentRead){apiModel.failNextDocumentRead=false;return reply({code:'INTERNAL_ERROR'},500);}return reply(apiModel.document);}
    if(method==='PATCH'){
     const input=request.postDataJSON() as {expectedRevision:number;preferences?:UserDocumentView['preferences'];lastVisitedPage?:UserDocumentView['lastVisitedPage']};if(input.expectedRevision!==apiModel.document.revision)return reply({code:'REVISION_CONFLICT'},409);
     apiModel.document={...apiModel.document,preferences:input.preferences??apiModel.document.preferences,lastVisitedPage:input.lastVisitedPage??apiModel.document.lastVisitedPage,revision:apiModel.document.revision+1};return reply(apiModel.document);
    }
   }
   if(url.pathname==='/studio-api/me/onboarding'&&method==='PATCH'){
    const input=request.postDataJSON();apiModel.onboardingWrites.push(input);if(apiModel.conflictNextOnboarding){apiModel.conflictNextOnboarding=false;apiModel.document.revision++;return reply({code:'REVISION_CONFLICT'},409);}if(input.expectedRevision!==apiModel.document.revision)return reply({code:'REVISION_CONFLICT'},409);
    apiModel.document={...apiModel.document,onboardingCompletedAt:'2026-10-08T16:00:00.000Z',revision:apiModel.document.revision+1};return reply(apiModel.document);
   }
   if(url.pathname==='/studio-api/me/model-configs'&&method==='GET'){if(apiModel.failNextList){apiModel.failNextList=false;return reply({code:'INTERNAL_ERROR'},500);}return reply({configs:apiModel.configs});}
   const match=/^\/studio-api\/me\/model-configs\/(video|text)(\/test)?$/.exec(url.pathname);
   if(match){
    const channel=match[1] as 'video'|'text',input=request.postDataJSON() as Record<string,unknown>;
    if(match[2]&&method==='POST'){
     apiModel.probes.push({channel,input});const gate=apiModel.probeGate;apiModel.probeGate=undefined;const result={requestId:input.requestId,connection:apiModel.connection,catalogStatus:apiModel.catalogStatus,models:[...apiModel.models],message:'Synthetic UI-only catalog',...(apiModel.failure?{failure:apiModel.failure}:{})};if(gate)await gate;return reply(result);
    }
    if(!match[2]&&method==='PATCH'){
     apiModel.configWrites.push({channel,input});if(apiModel.failNextSave){apiModel.failNextSave=false;return reply({code:'INTERNAL_ERROR'},500);}const prior=apiModel.configs.find(config=>config.channel===channel);
     if(apiModel.conflictNextSave){apiModel.conflictNextSave=false;if(prior)prior.revision++;return reply({code:'REVISION_CONFLICT'},409);}
     if(input.expectedRevision!==(prior?.revision??null))return reply({code:'REVISION_CONFLICT'},409);
     const saved:ModelConfig={channel,apiBase:input.apiBase as string,model:input.model as string,revision:(prior?.revision??0)+1,hasKey:Boolean(input.apiKey||prior?.hasKey)};apiModel.configs=apiModel.configs.filter(config=>config.channel!==channel).concat(saved);return reply(saved);
    }
   }
   // 云工作区用例由workspaceRoutes接管真实进程内应用：基座未覆盖的路径直接放行，
   // 无论双guard谁先匹配，有效请求都不会被误判404。设置套件保持passthrough=false，杂散请求仍被记录。
   if(apiModel.passthrough)return route.fallback();
   unexpected.push(method+' '+url.pathname);return reply({code:'NOT_FOUND'},404);
  });
  await use();await guard.closeExtraContexts();const evidence=guard.evidence();testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(evidence)});testInfo.annotations.push({type:'studio:validation-scope',description:'Task3 UI-only HTTP loopback / synthetic API; no backend, secure-cookie, trusted-TLS or generation acceptance'});expect(unexpected).toEqual([]);expect(evidence.paidRequests).toBe(0);expect(evidence.blockedRequests).toBe(0);
 },{auto:true}],
});
export {expect};
