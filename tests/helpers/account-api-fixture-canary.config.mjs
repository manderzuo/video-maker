import {defineConfig} from '@playwright/test';
if(process.env.STUDIO_ACCOUNT_API_FIXTURE_CANARY!=='1')throw new Error('Local fake fixture canary only');
export default defineConfig({testDir:'.',testMatch:'account-api-fixture-canary.spec.ts',workers:1,retries:0,timeout:15000,reporter:'line',outputDir:'../../work/account-api-cloud/api-fixture-canary-results',use:{channel:'msedge',ignoreHTTPSErrors:false,serviceWorkers:'block',launchOptions:{args:['--no-proxy-server']}}});
