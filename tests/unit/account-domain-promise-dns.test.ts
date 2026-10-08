import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
import {createPinnedPromiseLookup} from '../../scripts/account-domain-test-policy.mjs';

function canary(mode:'callback-only'|'dual'){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../helpers/account-dns-canary.mjs',import.meta.url)),mode],{encoding:'utf8',timeout:10000,env:{...process.env,STUDIO_ACCOUNT_DNS_CANARY:'1'}});
 expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);
 console.info('DNS_CANARY_EVIDENCE '+result.stdout.trim());
 const record=JSON.parse(result.stdout.trim()) as {requestSucceeded:boolean;requestError?:string;canaryHits:number;callbackCalls:number;promiseCalls:number;refusingSentinelCalls:number;blockedSocketAttempts:number;tlsAttempts:number;unknownDnsRefused:boolean;promiseResolverAvailable:boolean;namedExportsSynchronized:boolean;processHooksRestored:boolean;fakeServerClosed:boolean};
 expect(record.blockedSocketAttempts).toBe(0);expect(record.tlsAttempts).toBe(0);expect(record.namedExportsSynchronized).toBe(true);expect(record.processHooksRestored).toBe(true);expect(record.fakeServerClosed).toBe(true);
 return record;
}

it('reproduces callback-only Playwright DNS bypass using a refusing native-DNS sentinel, with zero endpoint hits',()=>{
 const record=canary('callback-only');expect(record.requestSucceeded).toBe(false);expect(record.requestError).toContain('FAKE_CANARY_DNS_DENIED');expect(record.canaryHits).toBe(0);expect(record.callbackCalls).toBe(0);expect(record.refusingSentinelCalls).toBe(1);
});

it('real Playwright APIRequestContext uses the pinned promise resolver and refuses unknown hosts before any socket',()=>{
 const record=canary('dual');expect(record.requestSucceeded).toBe(true);expect(record.promiseResolverAvailable).toBe(true);expect(record.promiseCalls).toBe(2);expect(record.callbackCalls).toBe(0);expect(record.refusingSentinelCalls).toBe(0);expect(record.canaryHits).toBe(1);expect(record.unknownDnsRefused).toBe(true);
});

it.each(['studio.gemstory.cn','localhost','127.0.0.1'])('promise lookup pins %s without consulting another resolver',async hostname=>{
 await expect(createPinnedPromiseLookup()(hostname)).resolves.toEqual({address:'127.0.0.1',family:4});
});

it.each(['api.example.com','49.232.128.118','studio.gemstory.cn.evil','STUDIO.GEMSTORY.CN'])('promise lookup refuses %s',async hostname=>{
 await expect(createPinnedPromiseLookup()(hostname,{all:true})).rejects.toMatchObject({code:'ENOTFOUND'});
});

it('promise lookup preserves Node single/all result shapes while pinning IPv4 despite numeric/family/order options',async()=>{
 const lookup=createPinnedPromiseLookup();
 await expect(lookup('studio.gemstory.cn',6)).resolves.toEqual({address:'127.0.0.1',family:4});
 await expect(lookup('studio.gemstory.cn',{all:false,family:6})).resolves.toEqual({address:'127.0.0.1',family:4});
 await expect(lookup('studio.gemstory.cn',{all:true,family:0,verbatim:true})).resolves.toEqual([{address:'127.0.0.1',family:4}]);
 await expect(lookup('studio.gemstory.cn',{all:true,order:'ipv6first'})).resolves.toEqual([{address:'127.0.0.1',family:4}]);
});
