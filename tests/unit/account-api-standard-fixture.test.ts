import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
const require=createRequire(import.meta.url);
it('real standard request fixture follows account auto-guard scheduling and closes all owned fake resources',()=>{
 const env={...process.env,STUDIO_ACCOUNT_API_FIXTURE_CANARY:'1',PLAYWRIGHT_BROWSERS_PATH:'E:/trae-studio/tools/playwright-browsers'};for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])delete env[key as keyof typeof env];
 const child=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',fileURLToPath(new URL('../helpers/account-api-fixture-canary.config.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,env});
 const evidence=child.stdout.match(/STANDARD_REQUEST_FIXTURE_EVIDENCE (\{[^\r\n]+\})/),cleanup=child.stdout.match(/STANDARD_REQUEST_FIXTURE_CLEANUP (\{[^\r\n]+\})/);if(evidence)console.info('STANDARD_REQUEST_FIXTURE_EVIDENCE '+evidence[1]);if(cleanup)console.info('STANDARD_REQUEST_FIXTURE_CLEANUP '+cleanup[1]);expect(child.error).toBeUndefined();expect(child.status,child.stdout+'\n'+child.stderr).toBe(0);expect(evidence).not.toBeNull();expect(cleanup).not.toBeNull();const r=JSON.parse(evidence![1]),c=JSON.parse(cleanup![1]);expect(r.channels).toEqual({standard:true,pageRequest:true,contextRequest:true,routeFetch:true});expect(Object.values(r.checks).every(Boolean)).toBe(true);expect(r.audit.blockedRequests).toBe(5);expect(r.audit.paidRequests).toBe(1);expect(r.audit.observedApiRequests).toBe(5);expect(c).toEqual({serversClosed:true,hooksRestored:true,nativeDnsAttempts:0,blockedSocketAttempts:0});
},35000);
