import {spawnSync} from 'node:child_process';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import tls from 'node:tls';
import {fileURLToPath} from 'node:url';
import {expect,it,vi} from 'vitest';
import {installDomainLoopbackResolver,assertDomainResolverInstalled,probeDomainTls} from '../../scripts/account-domain-test-policy.mjs';

import {installDomainAccountApiTransport,createDomainAccountApiBoundary} from '../helpers/account-api-transport.mjs';
import {createDomainLoopbackPolicy} from '../../scripts/account-domain-test-policy.mjs';

const held=/Domain adapter frozen: unresolved independent network review/;

it('refuses all domain execution entries before changing DNS or opening TLS',async()=>{
 const lookup=dns.lookup,promiseLookup=dnsPromises.lookup;
 const connect=vi.spyOn(tls,'connect').mockImplementation(()=>{throw new Error('TLS must not be attempted');});
 try{
  expect(()=>installDomainLoopbackResolver()).toThrow(held);
  expect(()=>assertDomainResolverInstalled()).toThrow(held);
  await expect(probeDomainTls()).rejects.toThrow(held);
  expect(dns.lookup).toBe(lookup);
  expect(dnsPromises.lookup).toBe(promiseLookup);
  expect(connect).not.toHaveBeenCalled();
 }finally{connect.mockRestore();}
});

it('freezes the real launcher before preflight, argument processing or browser spawn',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/run-account-domain-tests.mjs',import.meta.url)),'--config','unreviewed.config.ts'],{
  encoding:'utf8',timeout:5000,env:{...process.env,STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1'},
 });
 expect(result.status).toBe(1);
 expect(result.stderr).toMatch(held);
 expect(result.stdout).not.toContain('preflight');
});

it('keeps the wired API installer, boundary and loader frozen before hooks or test body',()=>{
 expect(()=>installDomainAccountApiTransport()).toThrow(held);expect(()=>createDomainAccountApiBoundary(createDomainLoopbackPolicy())).toThrow(held);
 const child=spawnSync(process.execPath,['--import',new URL('../../scripts/account-domain-loopback-loader.mjs',import.meta.url).href,'--eval','console.log("MUST_NOT_RUN_DOMAIN_BODY")'],{encoding:'utf8',timeout:5000,env:{...process.env,STUDIO_ACCOUNT_DOMAIN_SANDBOX:'1'}});expect(child.status).toBe(1);expect(child.stderr).toMatch(held);expect(child.stdout).not.toContain('MUST_NOT_RUN_DOMAIN_BODY');
});
