import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
function canary(mode:'baseline'|'guarded'|'identity'){
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('../helpers/account-api-transport-canary.mjs',import.meta.url)),mode],{encoding:'utf8',timeout:40000,env:{...process.env,STUDIO_ACCOUNT_API_CANARY:'1',PLAYWRIGHT_BROWSERS_PATH:'E:/trae-studio/tools/playwright-browsers'}});
 expect(child.error).toBeUndefined();expect(child.status,child.stderr).toBe(0);const r=JSON.parse(child.stdout.trim());console.info('API_TRANSPORT_CANARY_EVIDENCE '+JSON.stringify(r));expect(r.processHooksRestored).toBe(true);expect(r.fakeServersClosed).toBe(true);return r;
}
it('reproduces unguarded API paid-path, off-origin-port and automatic redirect gaps only against fake HTTP servers',()=>{
 const r=canary('baseline');expect(r.channels).toEqual({independent:true,pageRequest:true,contextRequest:true,routeFetch:true});expect(r.paidPathDelta).toBe(1);expect(r.offOriginDelta).toBe(1);expect(r.redirectFollowDelta).toBe(1);expect(r.blockedSocketAttempts).toBe(0);expect(r.nativeDnsAttempts).toBe(0);
},45000);
it('constrains page/context/independent API and route-fetch channels, refuses unsafe options and rejects untrusted local TLS without bypass',()=>{
 const r=canary('guarded');expect(r.paidPathDelta).toBe(0);expect(r.offOriginDelta).toBe(0);expect(r.redirectStatus).toBe(302);expect(r.redirectFollowDelta).toBe(0);expect(r.guardAvailable).toBe(true);expect(r.channels).toEqual({independent:true,pageRequest:true,contextRequest:true,routeFetch:true});expect(Object.values(r.checks).every(Boolean)).toBe(true);expect(Object.keys(r.checks)).toHaveLength(28);expect(r.audit.blockedApiRequests).toBe(16);expect(r.audit.blockedApiCreations).toBe(8);expect(r.audit.blockedApiRegistrations).toBe(3);expect(r.audit.blockedApiOperations).toBe(27);expect(r.tlsHttpHits).toBe(0);expect(r.blockedSocketAttempts).toBe(0);expect(r.nativeDnsAttempts).toBe(0);
},45000);

it('refuses genuinely pre-existing contexts and forged or swapped browser/request provenance before TLS or proxy traffic',()=>{
 const r=canary('identity');expect(r.guardAvailable).toBe(true);expect(r.checks.realUnregisteredSafe).toBe(true);expect(r.checks.realUnregisteredTls).toBe(true);expect(r.checks.realUnregisteredProxy).toBe(true);expect(r.checks.realOldBrowserApi).toBe(true);expect(r.checks.realOldBrowserRegistration).toBe(true);expect(r.checks.safeNativeTlsReject).toBe(true);expect(r.checks.forgedTlsWrapper).toBe(true);expect(r.checks.forgedProxyWrapper).toBe(true);expect(r.checks.forgedSafeWrapper).toBe(true);expect(r.checks.swappedRealRequest).toBe(true);expect(r.checks.inheritedRealWrapper).toBe(true);expect(r.checks.creationWindowRequestSwap).toBe(true);expect(r.checks.beforeBrowserTlsRewrite).toBe(true);expect(r.checks.beforeRequestTlsRewrite).toBe(true);expect(r.checks.lateRoutingHeaders).toBe(true);expect(r.tlsHttpHits).toBe(0);expect(r.offOriginHits).toBe(0);expect(r.blockedSocketAttempts).toBe(0);expect(r.nativeDnsAttempts).toBe(0);
},45000);
