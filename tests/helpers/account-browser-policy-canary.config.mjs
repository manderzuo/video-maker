import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
const mode=process.env.STUDIO_ACCOUNT_BROWSER_POLICY_CANARY;
if(!['local','env','config','project','worker-use'].includes(mode))throw new Error('Fake browser policy canary only');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const connectOptions={wsEndpoint:'ws://127.0.0.1:9/FAKE_CONNECT_OPTIONS'};
export default defineConfig({testDir:path.dirname(fileURLToPath(import.meta.url)),testMatch:'account-browser-policy-canary.spec.mjs',workers:1,retries:0,timeout:5000,reporter:'line',outputDir:path.join(root,'work/account-api-cloud/browser-policy-canary',mode+'-results'),use:mode==='config'?{connectOptions}:{},projects:mode==='project'?[{name:'FAKE_REMOTE_PROJECT',use:{connectOptions}}]:undefined});
