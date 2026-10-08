// Real Playwright fixture scheduler; fake browser object only, no connections.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test as base,expect} from '@playwright/test';
import {createDomainLocalBrowserGuard} from './account-domain-browser-guard.ts';
const mode=process.env.STUDIO_ACCOUNT_BROWSER_POLICY_CANARY;
if(!['local','env','config','project','worker-use'].includes(mode))throw new Error('Fake browser policy canary only');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const events=path.join(root,'work/account-api-cloud/browser-policy-canary',mode+'-events.jsonl');
const event=name=>fs.appendFileSync(events,JSON.stringify({name})+'\n');
const test=base.extend({
 domainLocalBrowserGuard:createDomainLocalBrowserGuard(true),
 browser:[async({connectOptions},use)=>{void connectOptions;event('fake-browser-created');await use({fixture:'FAKE_LOCAL_BROWSER'});},{scope:'worker'}],
});
if(mode==='worker-use')test.use({connectOptions:{wsEndpoint:'ws://127.0.0.1:9/FAKE_CONNECT_OPTIONS'}});
test('policy runs before any browser fixture or test body',async({browser})=>{event('test-body');expect(browser.fixture).toBe('FAKE_LOCAL_BROWSER');});
