// Separate child-process transport proof, not a domain/TLS/browser launcher.
// Native DNS is replaced with a refusing sentinel before requests. A second
// socket tripwire permits only this process's ephemeral fake HTTP endpoint.
import dns from 'node:dns';
import dnsPromises,{lookup as namedPromiseLookup} from 'node:dns/promises';
import {lookup as namedCallbackLookup} from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import {createServer} from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
import {request} from '@playwright/test';
import * as policy from '../../scripts/account-domain-test-policy.mjs';

const mode=process.argv[2];
if(process.env.STUDIO_ACCOUNT_DNS_CANARY!=='1'||!['callback-only','dual'].includes(mode))throw new Error('Explicit fake DNS canary mode required');
for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','PW_TEST_CONNECT_WS_ENDPOINT','PW_TEST_CONNECT_HEADERS','PW_TEST_CONNECT_EXPOSE_NETWORK'])delete process.env[key];
const original={lookup:dns.lookup,promiseLookup:dnsPromises.lookup,socketConnect:net.Socket.prototype.connect,tlsConnect:tls.connect};
const record={mode,scope:'Fake HTTP loopback APIRequestContext transport only; no TLS/browser acceptance',canaryHits:0,callbackCalls:0,promiseCalls:0,refusingSentinelCalls:0,blockedSocketAttempts:0,tlsAttempts:0,requestSucceeded:false,unknownDnsRefused:false,promiseResolverAvailable:false,namedExportsSynchronized:false};
const refused=()=>Object.assign(new Error('FAKE_CANARY_DNS_DENIED'),{code:'ENOTFOUND'});
let server,api,port;
const sockets=new Set();
try{
 // Node's Server.listen also consults callback DNS for its numeric loopback
 // host; use the fixed refusing policy so the owned endpoint can bind.
 dns.lookup=policy.createPinnedLookup();
 dnsPromises.lookup=async()=>{record.refusingSentinelCalls++;throw refused();};
 syncBuiltinESMExports();
 net.Socket.prototype.connect=function(...args){
  const options=Array.isArray(args[0])?args[0][0]:args[0];
  if(!options||typeof options!=='object'||options.host!=='127.0.0.1'||Number(options.port)!==port){record.blockedSocketAttempts++;throw new Error('FAKE_CANARY_SOCKET_TARGET_DENIED');}
  return Reflect.apply(original.socketConnect,this,args);
 };
 tls.connect=()=>{record.tlsAttempts++;throw new Error('FAKE_CANARY_TLS_FORBIDDEN');};
 server=createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/__fake_dns_probe'){res.writeHead(404,{Connection:'close'});res.end();return;}record.canaryHits++;res.writeHead(200,{'Content-Type':'application/json',Connection:'close'});res.end('{"fixture":"FAKE_DNS_LOOPBACK_CANARY"}');});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 port=server.address().port;
 const callbackLookup=policy.createPinnedLookup();
 dns.lookup=(...args)=>{record.callbackCalls++;return Reflect.apply(callbackLookup,dns,args);};
 if(mode==='dual'&&typeof policy.createPinnedPromiseLookup==='function'){
  const promiseLookup=policy.createPinnedPromiseLookup();record.promiseResolverAvailable=true;
  dnsPromises.lookup=(...args)=>{record.promiseCalls++;return Reflect.apply(promiseLookup,dnsPromises,args);};
 }
 syncBuiltinESMExports();
 record.namedExportsSynchronized=namedCallbackLookup===dns.lookup&&namedPromiseLookup===dnsPromises.lookup;
 api=await request.newContext({ignoreHTTPSErrors:false,timeout:1500});
 try{const response=await api.get(`http://studio.gemstory.cn:${port}/__fake_dns_probe`,{maxRedirects:0,maxRetries:0});record.requestSucceeded=response.status()===200&&(await response.json()).fixture==='FAKE_DNS_LOOPBACK_CANARY';}
 catch(error){record.requestError=error instanceof Error?error.message.split('\n')[0]:'unknown';}
 if(mode==='dual'&&record.requestSucceeded){
  try{await api.get(`http://unreviewed.account-dns.test:${port}/__fake_dns_probe`,{maxRedirects:0,maxRetries:0});}
  catch(error){record.unknownDnsRefused=error instanceof Error&&error.message.includes('Unreviewed domain lookup blocked');}
 }
}finally{
 await api?.dispose();
 for(const socket of sockets)socket.destroy();
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 dns.lookup=original.lookup;dnsPromises.lookup=original.promiseLookup;
 net.Socket.prototype.connect=original.socketConnect;tls.connect=original.tlsConnect;
 syncBuiltinESMExports();
 record.processHooksRestored=dns.lookup===original.lookup&&dnsPromises.lookup===original.promiseLookup&&net.Socket.prototype.connect===original.socketConnect&&tls.connect===original.tlsConnect;
 record.fakeServerClosed=!server?.listening;
}
console.log(JSON.stringify(record));
