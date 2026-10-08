import type {Browser,BrowserContext} from '@playwright/test';
import {assertDomainLoopbackPolicy,assertDomainResolverInstalled,createDomainLoopbackPolicy} from '../../scripts/account-domain-test-policy.mjs';
import {createLoopbackAccountApiBoundary,createDomainAccountApiBoundary} from './account-api-transport.mjs';
export function createAccountNetworkGuard(origin:string,protectApi=false){
 const parsedOrigin=new URL(origin);if(parsedOrigin.origin!==origin||parsedOrigin.hostname!=='127.0.0.1'||!['http:','https:'].includes(parsedOrigin.protocol))throw new Error('Exact loopback test origin required');
 return createExactOriginGuard(origin,protectApi?createLoopbackAccountApiBoundary(origin):undefined);
}
export function createAccountDomainNetworkGuard(policy:ReturnType<typeof createDomainLoopbackPolicy>){const reviewed=assertDomainLoopbackPolicy(policy);assertDomainResolverInstalled();return createExactOriginGuard(reviewed.origin,createDomainAccountApiBoundary(reviewed));}
function createExactOriginGuard(origin:string,api?:ReturnType<typeof createLoopbackAccountApiBoundary>){
 api?.activate();
 const parsedOrigin=new URL(origin),installed=new WeakSet<BrowserContext>(),extraContexts=new Set<BrowserContext>();let contexts=0,requests=0,blockedRequests=0,paidRequests=0;
 const allowed=(url:URL)=>url.origin===origin||url.origin===origin.replace(/^https?:/,parsedOrigin.protocol==='https:'?'wss:':'ws:');
 const paid=(url:URL)=>{let pathname=url.pathname;try{pathname=decodeURIComponent(pathname);}catch{return true;}return /(?:^|\/)(?:generations|completions|uploads|video\/submit)(?:\/|$)/.test(pathname);};
 async function install(context:BrowserContext){
  if(installed.has(context))return;api?.registerBrowserContext(context);installed.add(context);contexts++;
  context.on('request',()=>{requests++;});
  await context.route('**/*',async route=>{const url=new URL(route.request().url()),isPaid=paid(url);if(!allowed(url)||isPaid){blockedRequests++;if(isPaid)paidRequests++;await route.abort('blockedbyclient');}else await route.continue();});
  await context.routeWebSocket('**/*',socket=>{const url=new URL(socket.url()),isPaid=paid(url);if(!allowed(url)||isPaid){blockedRequests++;if(isPaid)paidRequests++;socket.close();}else socket.connectToServer();});
 }
 return {
  install,
  evidence:()=>{const apiEvidence=api?.evidence();return {coreWrites:0,paidRequests:paidRequests+(apiEvidence?.paidApiRequests??0),blockedRequests:blockedRequests+(apiEvidence?.blockedApiOperations??0),contexts,observedBrowserRequests:requests,...apiEvidence};},
  async newContext(browser:Browser){const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:false,serviceWorkers:'block'});try{await install(context);extraContexts.add(context);context.once('close',()=>extraContexts.delete(context));return context;}catch(error){await context.close();throw error;}},
  async closeExtraContexts(){try{for(const context of [...extraContexts])await context.close();}finally{await api?.close();}},
 };
}
