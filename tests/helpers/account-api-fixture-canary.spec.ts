// Actual account fixture and inherited standard Playwright request fixture.
// Both HTTP servers, DNS and socket permission are owned by this worker only.
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import {createServer,type Server} from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
import {test as account,expect} from './account-fixture';
import {createAccountNetworkGuard} from './account-network-guard';
import {restoreLoopbackApiRuntimeForTests} from './account-api-transport.mjs';
if(process.env.STUDIO_ACCOUNT_API_FIXTURE_CANARY!=='1')throw new Error('Local fake fixture canary only');
let origin='',otherOrigin='',mainHits=0,otherHits=0,paidHits=0,nativeDnsAttempts=0,blockedSocketAttempts=0;
const test=account.extend({
 backend:async({},use)=>{
  const oldLookup=dns.lookup,oldPromise=dnsPromises.lookup,oldConnect=net.Socket.prototype.connect;
  const ports=new Set<number>(),sockets=new Set<net.Socket>();let main:Server|undefined,other:Server|undefined;
  const listen=async(server:Server)=>{server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=(server.address() as net.AddressInfo).port;ports.add(port);return 'http://127.0.0.1:'+port;};
  try{
   dns.lookup=((hostname:string,options:unknown,callback:unknown)=>{const done=(typeof options==='function'?options:callback) as (error:Error|null,address?:string,family?:number)=>void;queueMicrotask(()=>{if(hostname==='127.0.0.1')done(null,'127.0.0.1',4);else{nativeDnsAttempts++;done(Object.assign(new Error('FAKE_DNS_REFUSED'),{code:'ENOTFOUND'}));}});}) as typeof dns.lookup;
   dnsPromises.lookup=(async()=>{nativeDnsAttempts++;throw Object.assign(new Error('FAKE_DNS_REFUSED'),{code:'ENOTFOUND'});}) as typeof dnsPromises.lookup;syncBuiltinESMExports();
   net.Socket.prototype.connect=function(this:net.Socket,...args:unknown[]){const options=(Array.isArray(args[0])?args[0][0]:args[0]) as {host?:string;port?:number}|undefined;if(!options||options.host!=='127.0.0.1'||!ports.has(Number(options.port))){blockedSocketAttempts++;throw new Error('FAKE_SOCKET_REFUSED');}return Reflect.apply(oldConnect,this,args);} as typeof oldConnect;
   other=createServer((_req,res)=>{otherHits++;res.end('FAKE_OFF_ORIGIN');});otherOrigin=await listen(other);
   main=createServer((req,res)=>{mainHits++;if(req.url==='/completions')paidHits++;if(req.headers['x-fake-redirect']==='1'){res.writeHead(302,{Location:otherOrigin+'/studio-api/session'});res.end();return;}res.writeHead(200,{'Content-Type':'text/html',Connection:'close'});res.end('<html><body>FAKE_ACCOUNT_FIXTURE</body></html>');});origin=await listen(main);
   await use({close:async()=>{}} as Parameters<typeof use>[0]);
  }finally{
   for(const s of sockets)s.destroy();for(const server of [main,other])if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
   dns.lookup=oldLookup;dnsPromises.lookup=oldPromise;net.Socket.prototype.connect=oldConnect;syncBuiltinESMExports();
   console.info('STANDARD_REQUEST_FIXTURE_CLEANUP '+JSON.stringify({serversClosed:[main,other].every(s=>!s?.listening),hooksRestored:dns.lookup===oldLookup&&dnsPromises.lookup===oldPromise&&net.Socket.prototype.connect===oldConnect,nativeDnsAttempts,blockedSocketAttempts}));
  }
 },
 // The optional API flag is deliberately ignored by the old guard in RED.
 networkAudit:async({backend},use)=>{void backend;const guard=createAccountNetworkGuard(origin,true);try{await use(guard);}finally{await guard.closeExtraContexts();restoreLoopbackApiRuntimeForTests();}},
});
test('standard request fixture and account context are guarded before their native creation',async({request,page,context,networkAudit})=>{
 const blocked=async(action:()=>Promise<unknown>)=>{try{await action();return false;}catch(error){return error instanceof Error&&error.message.includes('Account API boundary');}};
 const standard=(await request.get(origin+'/studio-api/session')).status()===200;await page.goto(origin);
 const pageRequest=(await page.request.get(origin+'/studio-api/session')).status()===200,contextRequest=(await context.request.get(origin+'/studio-api/session')).status()===200;
 await page.route('**/studio-api/me/document',async route=>{const response=await route.fetch();await route.fulfill({response});});
 const routeFetch=await page.evaluate(async()=>{const r=await fetch('/studio-api/me/document',{method:'PATCH'});return r.status===200;});
 const checks={paid:await blocked(()=>request.post(origin+'/completions',{data:{fake:true}})),offOrigin:await blocked(()=>request.get(otherOrigin+'/studio-api/session')),tlsOption:await blocked(()=>request.get(origin+'/studio-api/session',{ignoreHTTPSErrors:true})),redirectOption:await blocked(()=>request.get(origin+'/studio-api/session',{maxRedirects:1})),proxyFactory:await blocked(()=>context.request.get(otherOrigin+'/studio-api/session'))};
 const before=otherHits,redirect=await request.get(origin+'/studio-api/me/document',{headers:{'X-Fake-Redirect':'1'}});
 const record={channels:{standard,pageRequest,contextRequest,routeFetch},checks,mainHits,otherHits,paidHits,redirectStatus:redirect.status(),redirectFollowDelta:otherHits-before,audit:networkAudit.evidence(),nativeDnsAttempts,blockedSocketAttempts};console.info('STANDARD_REQUEST_FIXTURE_EVIDENCE '+JSON.stringify(record));
 expect(Object.values(record.channels).every(Boolean)).toBe(true);expect(Object.values(checks).every(Boolean)).toBe(true);expect(paidHits).toBe(0);expect(otherHits).toBe(0);expect(record.redirectStatus).toBe(302);expect(record.redirectFollowDelta).toBe(0);expect(nativeDnsAttempts).toBe(0);expect(blockedSocketAttempts).toBe(0);
});
