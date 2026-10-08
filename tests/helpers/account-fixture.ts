import {test as base,expect,type BrowserContext} from '@playwright/test';
import {browserBackend} from '../../server/tests/browser-fixture.js';
import {createAccountNetworkGuard,createAccountDomainNetworkGuard} from './account-network-guard';
import {createDomainLoopbackPolicy,assertDomainResolverInstalled} from '../../scripts/account-domain-test-policy.mjs';
import {createDomainLocalBrowserGuard} from './account-domain-browser-guard';
if(process.env.STUDIO_ACCOUNT_DOMAIN_TEST&&process.env.STUDIO_ACCOUNT_DOMAIN_TEST!=='1')throw new Error('Invalid domain test selector');
const domainPolicy=process.env.STUDIO_ACCOUNT_DOMAIN_TEST==='1'?createDomainLoopbackPolicy():null;if(domainPolicy)assertDomainResolverInstalled();
export const accountOrigin=domainPolicy?.origin??'https://127.0.0.1:4180';
export const test=base.extend<{backend:Awaited<ReturnType<typeof browserBackend>>;networkGuard:void;networkAudit:ReturnType<typeof createAccountNetworkGuard>;newAccountContext:()=>Promise<BrowserContext>},{domainLocalBrowserGuard:void}>({
 domainLocalBrowserGuard:createDomainLocalBrowserGuard(Boolean(domainPolicy)),
 backend:async({},use)=>{const backend=await browserBackend(accountOrigin);try{await use(backend);}finally{await backend.close();}},
 networkAudit:[async({},use,testInfo)=>{const guard=domainPolicy?createAccountDomainNetworkGuard(domainPolicy):createAccountNetworkGuard(accountOrigin);try{await use(guard);}finally{await guard.closeExtraContexts();const evidence=guard.evidence();testInfo.annotations.push({type:'studio:network-evidence',description:JSON.stringify(evidence)});testInfo.annotations.push({type:'studio:context-evidence',description:JSON.stringify({guardedContexts:evidence.contexts})});await testInfo.attach('account-network-evidence.json',{body:Buffer.from(JSON.stringify(evidence)),contentType:'application/json'});expect(evidence.blockedRequests).toBe(0);expect(evidence.paidRequests).toBe(0);}},{auto:true}],
 networkGuard:[async({networkAudit,context,backend},use)=>{void backend;await networkAudit.install(context);await use();},{auto:true}],
 newAccountContext:async({browser,networkAudit},use)=>{await use(()=>networkAudit.newContext(browser));},
});
export {expect};
