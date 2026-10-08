import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertDomainSandboxEnvironment,assertDomainLocalBrowserConfiguration,assertDomainLocalBrowserConnection} from '../../scripts/account-domain-test-policy.mjs';
import {createDomainTestCommand} from '../../scripts/account-domain-launch-policy.mjs';

it('permits an explicitly prepared local Linux environment with no remote browser variables',()=>{
 expect(()=>assertDomainSandboxEnvironment({STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1'},'linux')).not.toThrow();
});

it('permits only absent remote connection options for local configs',()=>{
 expect(()=>assertDomainLocalBrowserConnection(undefined,{})).not.toThrow();
 expect(()=>assertDomainLocalBrowserConfiguration({use:{},projects:[{use:{}}]},{})).not.toThrow();
});

it.each([{},null,{wsEndpoint:'ws://127.0.0.1:9/FAKE'},false])('rejects any defined remote connection option %j',connectOptions=>{
 expect(()=>assertDomainLocalBrowserConnection(connectOptions,{})).toThrow(/Remote browser connection config/);
 expect(()=>assertDomainLocalBrowserConfiguration({projects:[{use:{connectOptions}}]},{})).toThrow(/Remote browser connection config/);
});

it('rejects even empty remote browser environment values',()=>{
 for(const name of ['PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])expect(()=>assertDomainLocalBrowserConnection(undefined,{[name]:''})).toThrow(/Remote browser connection/);
});

it('builds an immutable command pinned to this repo, loader, CLI and domain config',()=>{
 const command=createDomainTestCommand([]),root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
 expect(command.executable).toBe(process.execPath);expect(command.cwd).toBe(root);expect(Object.isFrozen(command)).toBe(true);expect(Object.isFrozen(command.args)).toBe(true);
 expect(command.args).toEqual(['--import',path.join(root,'scripts/account-domain-loopback-loader.mjs'),path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',path.join(root,'playwright.account-domain.config.ts')]);
});

it.each([['--config','FAKE_OTHER_CONFIG'],['-c','FAKE_OTHER_CONFIG'],['--browser','firefox'],['--project','FAKE_REMOTE'],['--grep','FAKE_FILTER'],['--'],['--config=FAKE_OTHER_CONFIG']])('rejects all CLI passthrough %j',(...argv)=>{
 expect(()=>createDomainTestCommand(argv)).toThrow(/forbids additional CLI arguments/);
});

it.each(['local','env','config','project','worker-use'])('real Playwright fixture scheduler handles %s before browser creation',mode=>{
 const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),work=path.join(root,'work/account-api-cloud/browser-policy-canary');fs.mkdirSync(work,{recursive:true});
 const eventsFile=path.join(work,mode+'-events.jsonl');fs.writeFileSync(eventsFile,'');
 const env:NodeJS.ProcessEnv={...process.env,STUDIO_ACCOUNT_BROWSER_POLICY_CANARY:mode};
 for(const key of ['PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])delete env[key];
 if(mode==='env')env.PW_TEST_CONNECT_WS_ENDPOINT='ws://127.0.0.1:9/FAKE_REMOTE_BROWSER';
 const child=spawnSync(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',path.join(root,'tests/helpers/account-browser-policy-canary.config.mjs')],{cwd:root,encoding:'utf8',timeout:12000,env});
 expect(child.error).toBeUndefined();
 const events=fs.readFileSync(eventsFile,'utf8').trim().split('\n').filter(Boolean).map(line=>(JSON.parse(line) as {name:string}).name);
 console.info('BROWSER_POLICY_CANARY_EVIDENCE '+JSON.stringify({mode,exitCode:child.status,events,fakeBrowserOnly:true}));
 if(mode==='local'){expect(child.status,child.stdout+child.stderr).toBe(0);expect(events).toEqual(['fake-browser-created','test-body']);}
 else{expect(child.status).toBe(1);expect(child.stdout+child.stderr).toMatch(/Remote browser connection/);expect(events).toEqual([]);}
},15000);

it.each(['PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])('rejects remote browser environment %s',name=>{
 expect(()=>assertDomainSandboxEnvironment({STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1',[name]:name==='PW_TEST_CONNECT_HEADERS'?'{}':'FAKE_REMOTE_SELECTOR'},'linux')).toThrow(/Remote browser connection/);
});
