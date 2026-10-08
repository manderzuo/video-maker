import {test as base,expect} from '@playwright/test';
import {defaultPreferences} from '../../src/features/settings/preferences-store';
import type {UserDocumentView} from '../../src/infrastructure/api/user-document';
export const accountUiOrigin='http://127.0.0.1:4182';
const session={user:{id:'11111111-1111-4111-8111-111111111111',username:'Fake_UI_Only'},contextId:'a'.repeat(43),csrfToken:'b'.repeat(43),onboardingCompletedAt:null};
function createUiModel(){
 const {lastVisitedPage:_,defaultTextModel:__,defaultVideoModel:___,...preferences}=defaultPreferences;void _;void __;void ___;
 return {document:{revision:0,onboardingCompletedAt:null,lastVisitedPage:'/settings/appearance',preferences:{...preferences}} as UserDocumentView,sessionReads:0,documentReads:0,writes:[] as unknown[],conflictNextWrite:false,failNextDocumentRead:false,writeGate:undefined as Promise<void>|undefined};
}
export const test=base.extend<{uiModel:ReturnType<typeof createUiModel>;uiNetworkGuard:void}>({
 uiModel:async({},use)=>{await use(createUiModel());},
 uiNetworkGuard:[async({context,uiModel},use,testInfo)=>{
  const denied:string[]=[],unexpectedApi:string[]=[];let paid=0;
  const allowed=(url:string)=>{const target=new URL(url);return target.origin===accountUiOrigin||target.origin===accountUiOrigin.replace('http:','ws:');};
  context.on('request',request=>{if(!allowed(request.url()))denied.push(request.url());if(/\/(generations|completions|uploads|video\/submit)(?:\?|$)/.test(request.url()))paid++;});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!allowed(url.href))return route.abort('blockedbyclient');
   if(!url.pathname.startsWith('/studio-api/'))return route.continue();
   const reply=(json:unknown,status=200)=>route.fulfill({status,json});
   if(url.pathname==='/studio-api/me/model-configs'&&request.method()==='GET')return reply({configs:[]});
   if(url.pathname==='/studio-api/session'&&request.method()==='GET'){uiModel.sessionReads++;return reply(session);}
   if(url.pathname==='/studio-api/me/document'){
    if(request.headers()['x-workspace-context']!==session.contextId)return reply({code:'SESSION_CHANGED'},409);
    if(request.method()==='GET'){uiModel.documentReads++;if(uiModel.failNextDocumentRead){uiModel.failNextDocumentRead=false;return reply({code:'INTERNAL_ERROR'},500);}return reply(uiModel.document);}
    if(request.method()==='PATCH'){
     if(request.headers()['x-csrf-token']!==session.csrfToken)return reply({code:'CSRF_INVALID'},403);
     const patch=request.postDataJSON() as {expectedRevision:number;preferences?:UserDocumentView['preferences'];lastVisitedPage?:UserDocumentView['lastVisitedPage']};uiModel.writes.push(patch);const gate=uiModel.writeGate;uiModel.writeGate=undefined;if(gate)await gate;
     if(uiModel.conflictNextWrite){uiModel.conflictNextWrite=false;uiModel.document={...uiModel.document,revision:uiModel.document.revision+1};return reply({code:'REVISION_CONFLICT'},409);}
     if(patch.expectedRevision!==uiModel.document.revision)return reply({code:'REVISION_CONFLICT'},409);
     uiModel.document={...uiModel.document,...patch,revision:uiModel.document.revision+1};delete (uiModel.document as UserDocumentView&{expectedRevision?:number}).expectedRevision;return reply(uiModel.document);
    }
   }
   unexpectedApi.push(url.pathname);return reply({code:'NOT_FOUND'},404);
  });
  await context.routeWebSocket('**/*',socket=>{if(allowed(socket.url()))socket.connectToServer();else{denied.push(socket.url());socket.close();}});
  await use();testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify({coreWrites:0,paidRequests:paid,blockedRequests:denied.length})});testInfo.annotations.push({type:'studio:validation-scope',description:'UI-only HTTP loopback with synthetic API replies; no backend/cookie/TLS acceptance'});expect(denied).toEqual([]);expect(unexpectedApi).toEqual([]);expect(paid).toBe(0);
 },{auto:true}],
});
export {expect};
