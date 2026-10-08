import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test as base,expect} from './account-api-ui-fixture';
import {fixture,type Account} from '../../server/tests/account-fixture';
export const test=base.extend<{workspace:Awaited<ReturnType<typeof fixture>>&{account:Account;switchAccount:(account:Account)=>void};workspaceRoutes:void}>({
 workspace:async({apiModel},use)=>{
  const root=await mkdtemp(join(tmpdir(),'aiwork-cloud-ui-'));
  const env=await fixture({workspace:true,assets:{root,maxAssetBytes:1024*1024,userQuotaBytes:8*1024*1024,maxThumbnailBytes:256*1024}});const account=await env.signup('Cloud_UI_A');
  const value={...env,account,switchAccount(next:Account){value.account=next;apiModel.session={...next.view,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};apiModel.document={...apiModel.document,onboardingCompletedAt:'2026-10-09T00:00:00.000Z'};}};value.switchAccount(account);
  try{await use(value);}finally{await env.close();if(root.startsWith(join(tmpdir(),'aiwork-cloud-ui-')))await rm(root,{recursive:true,force:true});}
 },
 workspaceRoutes:[async({context,workspace,apiGuard},use,testInfo)=>{
  void apiGuard;
  await context.route(/\/studio-api\/(projects|assets)(\/|\?|$)/,async route=>{
   const request=route.request(),url=new URL(request.url()),headers=request.headers();
   if(url.origin!=='http://127.0.0.1:4310')return route.abort();
   const response=await workspace.app.inject({method:request.method() as 'GET'|'HEAD'|'POST'|'PATCH'|'DELETE'|'PUT',url:url.pathname+url.search,payload:request.postDataBuffer()??undefined,headers:{cookie:workspace.account.cookie,...(headers['x-workspace-context']?{'x-workspace-context':headers['x-workspace-context']}:{}),...(headers['x-csrf-token']?{'x-csrf-token':headers['x-csrf-token']}:{}),...(headers['content-type']?{'content-type':headers['content-type']}:{}),...(request.method()==='GET'||request.method()==='HEAD'?{}:{origin:'https://studio.test'})}});
   await route.fulfill({status:response.statusCode,body:response.rawPayload,headers:{'content-type':String(response.headers['content-type']??'application/json'),'cache-control':'no-store'}});
  });
  await use();testInfo.annotations.push({type:'studio:validation-scope',description:'Cloud UI + real isolated PostgreSQL/files through in-process route adapter; synthetic authentication, HTTP loopback; not secure-cookie/trusted-HTTPS acceptance'});
 },{auto:true}]
});
export {expect};
