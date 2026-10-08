import {defineConfig} from '@playwright/test';
import original from './playwright.account.config';
import {createDomainLoopbackPolicy,assertDomainResolverInstalled,assertDomainLocalBrowserConfiguration} from './scripts/account-domain-test-policy.mjs';
assertDomainResolverInstalled();assertDomainLocalBrowserConfiguration(original);const policy=createDomainLoopbackPolicy();
export default defineConfig({...original,reporter:[['list'],['./tests/helpers/coverage-reporter.ts',{output:'work/account-api-cloud/account-domain-browser-evidence.json'}]],outputDir:'work/account-api-cloud/account-domain-browser-results',use:{...original.use,baseURL:policy.origin,channel:'chromium',ignoreHTTPSErrors:false,serviceWorkers:'block',launchOptions:{args:['--host-resolver-rules='+policy.resolverRules,'--no-proxy-server']}}});
