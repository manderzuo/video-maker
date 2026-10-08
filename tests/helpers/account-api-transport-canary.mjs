// Isolated local HTTP proof. Baseline paid-path and off-origin requests go
// only to these fake servers. Native DNS and outbound sockets are tripwired.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {request,chromium} from '@playwright/test';
const mode=process.argv[2];if(!['baseline','guarded','identity'].includes(mode)||process.env.STUDIO_ACCOUNT_API_CANARY!=='1')throw new Error('Fake API transport canary only');
for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])delete process.env[key];
const old={lookup:dns.lookup,promiseLookup:dnsPromises.lookup,connect:net.Socket.prototype.connect};
const ports=new Set(),sockets=new Set(),apis=new Set(),checks={};
const record={mode,guardAvailable:false,mainHits:0,offOriginHits:0,syntheticPaidPathHits:0,tlsHttpHits:0,blockedSocketAttempts:0,nativeDnsAttempts:0,channels:{},checks};
let main,other,tlsServer,browser,context,oldBrowserContext,boundary,tlsBoundary,certDir;
const hit=(req,res)=>{record.mainHits++;if(req.url==='/completions')record.syntheticPaidPathHits++;if(req.url==='/studio-api/me/document'&&req.headers['x-fake-redirect']==='1'){res.writeHead(302,{Location:otherOrigin+'/studio-api/session',Connection:'close'});res.end();return;}res.writeHead(200,{'Content-Type':'application/json',Connection:'close'});res.end(JSON.stringify({fixture:'FAKE_ACCOUNT_API',method:req.method}));};
const listen=async server=>{server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;ports.add(port);return port;};
let origin,otherOrigin,module;
async function rejected(name,action){try{await action();checks[name]=false;}catch(error){checks[name]=error instanceof Error&&error.message.includes('Account API boundary');}}
try{
 dns.lookup=(hostname,options,callback)=>{const done=typeof options==='function'?options:callback;queueMicrotask(()=>{if(hostname==='127.0.0.1')done(null,'127.0.0.1',4);else{record.nativeDnsAttempts++;done(Object.assign(new Error('FAKE_DNS_REFUSED'),{code:'ENOTFOUND'}));}});};
 dnsPromises.lookup=async()=>{record.nativeDnsAttempts++;throw Object.assign(new Error('FAKE_DNS_REFUSED'),{code:'ENOTFOUND'});};syncBuiltinESMExports();
 net.Socket.prototype.connect=function(...args){const options=Array.isArray(args[0])?args[0][0]:args[0];if(!options||typeof options!=='object'||options.host!=='127.0.0.1'||!ports.has(Number(options.port))){record.blockedSocketAttempts++;throw new Error('FAKE_SOCKET_REFUSED');}return Reflect.apply(old.connect,this,args);};
 main=createServer(hit);origin='http://127.0.0.1:'+await listen(main);
 other=createServer((_req,res)=>{record.offOriginHits++;res.writeHead(200,{'Content-Type':'application/json',Connection:'close'});res.end('{"fixture":"FAKE_OFF_ORIGIN"}');});otherOrigin='http://127.0.0.1:'+await listen(other);
 if(mode==='identity'){
  certDir=fs.mkdtempSync(path.join(os.tmpdir(),'account-api-fake-tls-'));const key=path.join(certDir,'FAKE-key.pem'),cert=path.join(certDir,'FAKE-cert.pem');
  execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',windowsHide:true});
  tlsServer=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(_req,res)=>{record.tlsHttpHits++;res.end('FAKE_TLS_IDENTITY_REPRODUCTION');});const secureOrigin='https://127.0.0.1:'+await listen(tlsServer);
  // These are genuinely created BEFORE activation, with real server defaults.
  const unsafe=await request.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:true});apis.add(unsafe);
  const oldSafe=await request.newContext({baseURL:origin,ignoreHTTPSErrors:false});apis.add(oldSafe);
  const oldProxy=await request.newContext({baseURL:origin,proxy:{server:otherOrigin}});apis.add(oldProxy);
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});oldBrowserContext=await browser.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:true,serviceWorkers:'block'});
  module=await import('./account-api-transport.mjs');boundary=module.createLoopbackAccountApiBoundary(secureOrigin);boundary.activate();record.guardAvailable=true;
  await rejected('realUnregisteredSafe',()=>oldSafe.get(secureOrigin+'/studio-api/session'));
  await rejected('realUnregisteredTls',()=>unsafe.get('/studio-api/session'));
  await rejected('realUnregisteredProxy',()=>oldProxy.get(secureOrigin+'/studio-api/session'));
  await rejected('realOldBrowserApi',()=>oldBrowserContext.request.get('/studio-api/session'));
  await rejected('realOldBrowserRegistration',()=>boundary.registerBrowserContext(oldBrowserContext));
  const wrapper=api=>({_options:{ignoreHTTPSErrors:false},browser:()=>({_options:{}}),request:api});
  await rejected('forgedTlsWrapper',()=>boundary.registerBrowserContext(wrapper(unsafe)));
  if(!checks.forgedTlsWrapper)record.forgedTlsStatus=(await unsafe.get('/studio-api/session',{ignoreHTTPSErrors:false})).status();
  await rejected('forgedProxyWrapper',()=>boundary.registerBrowserContext(wrapper(oldProxy)));
  await rejected('forgedSafeWrapper',()=>boundary.registerBrowserContext(wrapper(oldSafe)));
  // Normal instrumentation runs before the native creation promise returns.
  // Test that window, rather than swapping request only after newContext.
  const swappedContexts=new Map();
  const swapListener={runAfterCreateBrowserContext(created){swappedContexts.set(created,created.request);created.request=unsafe;}};
  browser._instrumentation.addListener(swapListener);
  try{
   await rejected('creationWindowRequestSwap',async()=>{
    const created=await browser.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:false,serviceWorkers:'block'});
    boundary.registerBrowserContext(created);await created.request.get('/studio-api/session');
   });
  }finally{
   browser._instrumentation.removeListener(swapListener);
   for(const [created,own] of swappedContexts){created.request=own;await created.close();}
  }
  const beforeBrowser={runBeforeCreateBrowserContext(options){options.ignoreHTTPSErrors=true;}};
  browser._instrumentation.addListener(beforeBrowser);
  let injectedContext;
  try{
   await rejected('beforeBrowserTlsRewrite',async()=>{
    injectedContext=await browser.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:false,serviceWorkers:'block'});
    boundary.registerBrowserContext(injectedContext);await injectedContext.request.get('/studio-api/session');
   });
  }finally{browser._instrumentation.removeListener(beforeBrowser);await injectedContext?.close();}
  const beforeRequest={runBeforeCreateRequestContext(options){options.ignoreHTTPSErrors=true;}};
  browser._instrumentation.addListener(beforeRequest);
  try{
   await rejected('beforeRequestTlsRewrite',async()=>{
    const created=await request.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:false});apis.add(created);await created.get('/studio-api/session');
   });
  }finally{browser._instrumentation.removeListener(beforeRequest);}
  context=await browser.newContext({baseURL:secureOrigin,ignoreHTTPSErrors:false,serviceWorkers:'block'});
  const ownRequest=context.request;context.request=unsafe;
  await rejected('swappedRealRequest',()=>boundary.registerBrowserContext(context));context.request=ownRequest;
  await rejected('inheritedRealWrapper',()=>boundary.registerBrowserContext(Object.create(context)));
  await rejected('lateRoutingHeaders',()=>context.setExtraHTTPHeaders({Host:'unreviewed.account-api.test','X-Original-URL':'/completions'}));
  boundary.registerBrowserContext(context);try{await context.request.get('/studio-api/session');checks.safeNativeTlsReject=false;}catch(error){checks.safeNativeTlsReject=error instanceof Error&&/self.signed|certificate/i.test(error.message);}
  record.audit=boundary.evidence();
 }else{
 if(mode==='guarded'){try{module=await import('./account-api-transport.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}if(module){boundary=module.createLoopbackAccountApiBoundary(origin);boundary.activate();record.guardAvailable=true;}}
 const preexisting=await request.newContext({baseURL:origin,ignoreHTTPSErrors:false});apis.add(preexisting);
 const api=await request.newContext({baseURL:origin,ignoreHTTPSErrors:false});apis.add(api);
 record.channels.independent=(await api.get('/studio-api/session')).status()===200;
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:false,serviceWorkers:'block'});
 if(boundary)boundary.registerBrowserContext(context);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
 const page=await context.newPage();await page.goto(origin);
 record.channels.pageRequest=(await page.request.get('/studio-api/session')).status()===200;
 record.channels.contextRequest=(await context.request.get('/studio-api/session')).status()===200;
 await page.route('**/studio-api/me/document',async route=>{const reply=await route.fetch();await route.fulfill({response:reply});});
 record.channels.routeFetch=await page.evaluate(async()=>{const r=await fetch('/studio-api/me/document',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"fake":true}'});return r.status===200;});
 const paidBefore=record.syntheticPaidPathHits;await rejected('paidPath',()=>api.post(origin+'/completions',{data:{fake:true}}));record.paidPathDelta=record.syntheticPaidPathHits-paidBefore;
 const offBefore=record.offOriginHits;await rejected('offOriginPort',()=>api.get(otherOrigin+'/studio-api/session'));record.offOriginDelta=record.offOriginHits-offBefore;
 const redirectBefore=record.offOriginHits;const redirect=await api.get('/studio-api/me/document',{headers:{'X-Fake-Redirect':'1'}});record.redirectStatus=redirect.status();record.redirectFollowDelta=record.offOriginHits-redirectBefore;
 if(boundary){
  for(const [name,target] of [['publicIp','http://49.232.128.118:9/studio-api/session'],['ipv6','http://[::1]:9/studio-api/session'],['foreignHost','http://unreviewed.account-api.test:9/studio-api/session'],['schemeRelative','//49.232.128.118:9/studio-api/session'],['wrongScheme',origin.replace('http:','https:')+'/studio-api/session'],['encodedPaid',origin+'/%2563ompletions'],['unlistedPath',origin+'/not-account']])await rejected(name,()=>api.get(target));
  for(const [name,options] of [['tlsBypass',{ignoreHTTPSErrors:true}],['redirectOverride',{maxRedirects:1}],['retryOverride',{maxRetries:1}],['lookupHook',{__testHookLookup:()=>[{address:'49.232.128.118',family:4}]}],['hostOverride',{headers:{Host:'unreviewed.account-api.test'}}],['originOverride',{headers:{Origin:'https://unreviewed.account-api.test'}}],['methodOverride',{method:'CONNECT'}]])await rejected(name,()=>api.fetch('/studio-api/session',options));
  for(const [name,options] of [['factoryTls',{ignoreHTTPSErrors:true}],['factoryProxy',{proxy:{server:otherOrigin}}],['factoryBase',{baseURL:otherOrigin}],['factoryStorageFile',{storageState:'FAKE_MUST_NOT_READ.json'}],['factoryCertificate',{clientCertificates:[{origin,certPath:'FAKE_MUST_NOT_READ.pem',keyPath:'FAKE_MUST_NOT_READ.key'}]}],['factoryRedirect',{maxRedirects:2}]])await rejected(name,()=>request.newContext(options));
  for(const [name,options] of [['browserTls',{ignoreHTTPSErrors:true}],['browserProxy',{proxy:{server:otherOrigin}}]])await rejected(name,()=>boundary.registerBrowserContext({_options:options,request:{},browser:()=>({_options:{}})}));
  await rejected('unverifiedBrowserWrapper',()=>boundary.registerBrowserContext({request:{}}));
  await rejected('realBrowserTlsCreation',()=>browser.newContext({baseURL:origin,ignoreHTTPSErrors:true}));
  await rejected('realBrowserProxyCreation',()=>browser.newContext({baseURL:origin,ignoreHTTPSErrors:false,proxy:{server:otherOrigin}}));
  record.audit=boundary.evidence();
 }
 await context.close();context=undefined;await browser.close();browser=undefined;
 for(const a of apis)await a.dispose({reason:'Fake canary completed'});apis.clear();await boundary?.close();boundary=undefined;
 if(module){
  certDir=fs.mkdtempSync(path.join(os.tmpdir(),'account-api-fake-tls-'));const key=path.join(certDir,'FAKE-key.pem'),cert=path.join(certDir,'FAKE-cert.pem');
  execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',windowsHide:true});
  tlsServer=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(_req,res)=>{record.tlsHttpHits++;res.end('FAKE_TLS_MUST_NOT_BE_ACCEPTED');});const secureOrigin='https://127.0.0.1:'+await listen(tlsServer);
  tlsBoundary=module.createLoopbackAccountApiBoundary(secureOrigin);tlsBoundary.activate();const secure=await request.newContext();apis.add(secure);
  try{await secure.get('/studio-api/session');checks.strictTlsReject=false;}catch(error){checks.strictTlsReject=error instanceof Error&&/self.signed|certificate/i.test(error.message);}
 }
 }
}finally{
 await context?.close();await oldBrowserContext?.close();await browser?.close();for(const api of apis)await api.dispose({reason:'Fake canary cleanup'});await boundary?.close();await tlsBoundary?.close();
 for(const s of sockets)s.destroy();for(const server of [main,other,tlsServer])if(server?.listening)await new Promise(resolve=>server.close(resolve));
 module?.restoreLoopbackApiRuntimeForTests();dns.lookup=old.lookup;dnsPromises.lookup=old.promiseLookup;net.Socket.prototype.connect=old.connect;syncBuiltinESMExports();
 if(certDir){const root=path.resolve(os.tmpdir());if(!path.resolve(certDir).startsWith(root+path.sep+'account-api-fake-tls-'))throw new Error('Unexpected fake certificate cleanup target');for(const file of ['FAKE-key.pem','FAKE-cert.pem'])if(fs.existsSync(path.join(certDir,file)))fs.unlinkSync(path.join(certDir,file));fs.rmdirSync(certDir);}
 record.processHooksRestored=dns.lookup===old.lookup&&dnsPromises.lookup===old.promiseLookup&&net.Socket.prototype.connect===old.connect;
 record.fakeServersClosed=[main,other,tlsServer].every(s=>!s?.listening);
}
console.log(JSON.stringify(record));
