import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import tls from 'node:tls';
import {assertStrictTlsEnvironment} from './account-tls-environment.mjs';
export const domainOrigin='https://studio.gemstory.cn:8443';
export const domainHostname='studio.gemstory.cn';
export const mappedAddress='127.0.0.1';
const fingerprint='9B:0A:86:5C:3F:7C:E2:83:93:55:43:C4:C1:8E:94:56:BF:A3:B8:D4:3E:2E:DA:AB:92:69:5F:D8:D4:8D:2B:81';
/** @typedef {{readonly origin:string,readonly hostname:string,readonly address:string,readonly port:number,readonly resolverRules:string}} DomainPolicy */
const policies=new WeakSet(),installedResolvers=new WeakMap();
/** Draft adapter is quarantined after independent review. No environment flag
 * or CLI argument can enable it. The promise DNS, APIRequestContext, remote
 * browser and CLI scope findings must be repaired and re-reviewed first.
 * This hold is separate from remote MFA/resource/isolation prerequisites. */
export function assertDomainAdapterExecutionReady(){throw new Error('Domain adapter frozen: unresolved independent network review');}
/** @returns {DomainPolicy} */
export function createDomainLoopbackPolicy(){const policy=Object.freeze({origin:domainOrigin,hostname:domainHostname,address:mappedAddress,port:8443,resolverRules:'MAP studio.gemstory.cn 127.0.0.1'});policies.add(policy);return policy;}
/** @param {unknown} policy @returns {DomainPolicy} */
export function assertDomainLoopbackPolicy(policy){if(!policy||typeof policy!=='object'||!policies.has(policy))throw new Error('Sealed fixed domain loopback policy required');return /** @type {DomainPolicy} */(policy);}
/** @returns {typeof dns.lookup} */
export function createPinnedLookup(){return /** @type {typeof dns.lookup} */(function(hostname,options,callback){
 const done=typeof options==='function'?options:callback,all=typeof options==='object'&&options?.all;
 if(typeof done!=='function')throw new TypeError('DNS callback required');
 queueMicrotask(()=>{if(![domainHostname,mappedAddress,'localhost'].includes(hostname)){const error=Object.assign(new Error('Unreviewed domain lookup blocked'),{code:'ENOTFOUND'});done(error);return;}if(all)done(null,[{address:mappedAddress,family:4}]);else done(null,mappedAddress,4);});
 });}
/** @returns {typeof dnsPromises.lookup} */
export function createPinnedPromiseLookup(){return /** @type {typeof dnsPromises.lookup} */(async function(hostname,options){
 if(![domainHostname,mappedAddress,'localhost'].includes(hostname))throw Object.assign(new Error('Unreviewed domain lookup blocked'),{code:'ENOTFOUND'});
 const address={address:mappedAddress,family:4};
 return typeof options==='object'&&options?.all?[address]:address;
 });}
/** @param {unknown} connectOptions @param {NodeJS.ProcessEnv} [env] */
export function assertDomainLocalBrowserConnection(connectOptions,env=process.env){
 for(const name of ['PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])if(env[name]!==undefined)throw new Error('Remote browser connection environment is forbidden: '+name);
 if(connectOptions!==undefined)throw new Error('Remote browser connection config is forbidden: connectOptions');
}
/** @param {{use?:{connectOptions?:unknown},projects?:Array<{use?:{connectOptions?:unknown}}>} config @param {NodeJS.ProcessEnv} [env] */
export function assertDomainLocalBrowserConfiguration(config,env=process.env){
 assertDomainLocalBrowserConnection(config.use?.connectOptions,env);
 for(const project of config.projects??[])assertDomainLocalBrowserConnection(project.use?.connectOptions,env);
}
/** The flag acknowledges preparation; it does not prove isolation. Remote
 * ownership/resource/isolation checks remain separate prerequisites.
 * @param {NodeJS.ProcessEnv} [env] @param {string} [platform] */
export function assertDomainSandboxEnvironment(env=process.env,platform=process.platform){
 if(platform!=='linux'||env.STUDIO_ACCOUNT_DOMAIN_SANDBOX!=='1')throw new Error('Prepared and reviewed Linux account test sandbox required');assertStrictTlsEnvironment(env);
 assertDomainLocalBrowserConnection(undefined,env);
 for(const name of['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])if(env[name])throw new Error('Alternate trust or proxy environment is forbidden: '+name);
}
export function installDomainLoopbackResolver(){
 assertDomainAdapterExecutionReady();assertDomainSandboxEnvironment();
 if(dns.promises!==dnsPromises)throw new Error('Unexpected Node promise DNS object');
 if(installedResolvers.has(dns.lookup)){if(installedResolvers.get(dns.lookup)!==dnsPromises.lookup)throw new Error('Pinned Node DNS pair was changed');return()=>{};}
 const original={lookup:dns.lookup,promiseLookup:dnsPromises.lookup},lookup=createPinnedLookup(),promiseLookup=createPinnedPromiseLookup();
 installedResolvers.set(lookup,promiseLookup);dns.lookup=lookup;dnsPromises.lookup=promiseLookup;syncBuiltinESMExports();
 return()=>{if(dns.lookup===lookup)dns.lookup=original.lookup;if(dnsPromises.lookup===promiseLookup)dnsPromises.lookup=original.promiseLookup;installedResolvers.delete(lookup);syncBuiltinESMExports();};
}
export function assertDomainResolverInstalled(){assertDomainAdapterExecutionReady();assertDomainSandboxEnvironment();const expected=installedResolvers.get(dns.lookup);if(dns.promises!==dnsPromises||typeof expected!=='function'||expected!==dnsPromises.lookup)throw new Error('Pinned Node callback and promise DNS pair is not installed');}
/** @param {{authorized:boolean,protocol:string|null,subjectaltname?:string,fingerprint256?:string}} peer */
export function validateDomainPeer(peer){if(!peer.authorized||!['TLSv1.2','TLSv1.3'].includes(peer.protocol??'')||peer.fingerprint256!==fingerprint||!peer.subjectaltname?.split(/,\s*/).includes('DNS:'+domainHostname))throw new Error('Reviewed public certificate and strict hostname TLS required');}
export async function probeDomainTls(){assertDomainAdapterExecutionReady();assertDomainSandboxEnvironment();return new Promise((resolve,reject)=>{
 const socket=tls.connect({host:mappedAddress,port:8443,servername:domainHostname,rejectUnauthorized:true},()=>{try{const cert=socket.getPeerCertificate();validateDomainPeer({authorized:socket.authorized,protocol:socket.getProtocol(),subjectaltname:cert.subjectaltname,fingerprint256:cert.fingerprint256});resolve({authorized:true,protocol:socket.getProtocol(),fingerprint256:cert.fingerprint256,origin:domainOrigin,target:mappedAddress});}catch(error){reject(error);}finally{socket.destroy();}});
 socket.setTimeout(8000,()=>socket.destroy(new Error('Isolated TLS preflight timeout')));socket.once('error',reject);
 });}
