import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {BlockList,isIP} from 'node:net';
import {HttpError} from '../errors.js';
export type ModelChannel='text'|'video';
export type ResolvedAddress={address:string;family:number};
export type OutboundRequest={url:string;address:string;family:4|6;apiKey:string;signal:AbortSignal;maxBytes:number;method?:'GET'|'POST';body?:Buffer;idempotencyKey?:string;textSessionId?:string};
export type OutboundResponse={status:number;body:Buffer};
export type OutboundAdapters={resolve:(hostname:string)=>Promise<ResolvedAddress[]>;request:(request:OutboundRequest)=>Promise<OutboundResponse>};
export type VideoOutboundOperation={kind:'asset';body:string}|{kind:'submit';body:string;idempotencyKey:string}|{kind:'query'|'content';taskId:string};
const blocked4=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked4.addSubnet(address,prefix,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
const blocked6=new BlockList();for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16]] as const)blocked6.addSubnet(address,prefix,'ipv6');
function publicAddress(address:string){const family=isIP(address);return family===4?!blocked4.check(address,'ipv4'):family===6&&global6.check(address,'ipv6')&&!blocked6.check(address,'ipv6');}
function hostName(url:URL){return url.hostname.replace(/^\[|\]$/g,'');}
export function normalizeModelBase(value:string):string{
 try{
  const trimmed=value.trim();if(trimmed.length>2048||trimmed.includes('?')||trimmed.includes('#')||/[\u0000-\u0020\u007f]/.test(trimmed)||/\\|(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)|%2f|%5c/i.test(trimmed))throw new Error('Unsafe base');
  const url=new URL(trimmed),host=hostName(url);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!host||host==='localhost'||/\.(localhost|local|internal)$/.test(host)||(isIP(host)&&!publicAddress(host)))throw new Error('Unsafe destination');
  url.pathname=url.pathname.replace(/\/v1\/chat\/completions\/?$/,'').replace(/\/$/,'').replace(/\/v1$/,'');
  if(/\/v1(?:\/v1)+$/.test(trimmed.replace(/\/$/,'')))throw new Error('Repeated version path');
  return url.href.replace(/\/$/,'');
 }catch{throw new HttpError(400,'INVALID_API_BASE');}
}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const aborted=()=>reject(new HttpError(504,'UPSTREAM_TIMEOUT'));
  if(signal.aborted){aborted();return;}
  signal.addEventListener('abort',aborted,{once:true});
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
 });
}
export async function nativeHttpsRequest(input:OutboundRequest):Promise<OutboundResponse>{
 return new Promise((resolve,reject)=>{
  const url=new URL(input.url),hostname=hostName(url);
  const req=httpsRequest(url,{method:input.method??'GET',agent:false,rejectUnauthorized:true,servername:isIP(hostname)?undefined:hostname,signal:input.signal,
   headers:{Accept:'application/json',Authorization:'Bearer '+input.apiKey,...(input.body?{'Content-Type':'application/json','Content-Length':String(input.body.length)}:{}),...(input.idempotencyKey?{'Idempotency-Key':input.idempotencyKey}:{}),...(input.textSessionId?{'x-opencode-session':input.textSessionId}:{})},
   lookup:(_host,options,callback)=>{
    if(typeof options==='object'&&options.all)callback(null,[{address:input.address,family:input.family}]);
    else callback(null,input.address,input.family);
   }
  },response=>{
   const status=response.statusCode??502;if(status>=300&&status<400){response.destroy();reject(new HttpError(502,'UPSTREAM_FAILED'));return;}
   let size=0;const chunks:Buffer[]=[];
   response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>input.maxBytes){response.destroy();reject(new HttpError(502,'UPSTREAM_TOO_LARGE'));return;}chunks.push(chunk);});
   response.on('end',()=>resolve({status,body:Buffer.concat(chunks)}));response.on('error',reject);response.on('aborted',()=>reject(new HttpError(502,'UPSTREAM_FAILED')));
  });req.on('error',reject);req.end(input.body);
 });
}
export class RestrictedOutbound {
 constructor(private readonly adapters:OutboundAdapters={resolve:hostname=>lookup(hostname,{all:true,verbatim:true}),request:nativeHttpsRequest}){}
 async video(base:string,apiKey:string,operation:VideoOutboundOperation,maxContentBytes=200*1024*1024):Promise<OutboundResponse>{
  const normalized=normalizeModelBase(base),endpoint=new URL(normalized);
  if(!apiKey||/[\u0000-\u0020\u007f-\u009f]/.test(apiKey))throw new HttpError(400,'INVALID_API_KEY');
  let path:string,body:Buffer|undefined,idempotencyKey:string|undefined;
  if(operation.kind==='asset'||operation.kind==='submit'){
   if(typeof operation.body!=='string'||Buffer.byteLength(operation.body)>46*1024*1024)throw new HttpError(400,'INVALID_REQUEST');body=Buffer.from(operation.body);path=operation.kind==='asset'?'v1/assets':'v1/videos/generations';
   if(operation.kind==='submit'){if(!/^[-A-Za-z0-9._~]{1,256}$/.test(operation.idempotencyKey))throw new HttpError(400,'INVALID_REQUEST');idempotencyKey=operation.idempotencyKey;}
  }else if(operation.kind==='query'||operation.kind==='content'){
   if(!/^[-A-Za-z0-9._~]{1,256}$/.test(operation.taskId)||['.','..'].includes(operation.taskId))throw new HttpError(400,'INVALID_REQUEST');path='v1/videos/'+operation.taskId+(operation.kind==='content'?'/content':'');
  }else throw new HttpError(400,'INVALID_REQUEST');
  const limit=operation.kind==='content'?maxContentBytes:1024*1024;if(!Number.isSafeInteger(limit)||limit<1||limit>200*1024*1024)throw new HttpError(400,'INVALID_REQUEST');
  endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/'+path;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),operation.kind==='query'?15000:120000);
  try{
   const hostname=hostName(endpoint),literal=isIP(hostname),addresses=literal?[{address:hostname,family:literal}]:await bounded(this.adapters.resolve(hostname),controller.signal);
   if(!addresses.length||addresses.some(address=>address.family!==isIP(address.address)||!publicAddress(address.address)))throw new HttpError(400,'OUTBOUND_BLOCKED');const selected=addresses[0]!;
   const reply=await bounded(this.adapters.request({url:endpoint.href,address:selected.address,family:selected.family as 4|6,apiKey,signal:controller.signal,maxBytes:limit,method:body?'POST':'GET',...(body?{body}:{}),...(idempotencyKey?{idempotencyKey}:{})}),controller.signal);
   if(reply.status>=300&&reply.status<400)throw new HttpError(502,'UPSTREAM_FAILED');if(reply.body.length>limit)throw new HttpError(502,'UPSTREAM_TOO_LARGE');return reply;
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'UPSTREAM_FAILED');}finally{clearTimeout(timer);}
 }
 async completion(base:string,apiKey:string,body:string,idempotencyKey:string,textSessionId:string):Promise<OutboundResponse>{
  const normalized=normalizeModelBase(base),endpoint=new URL(normalized);endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/v1/chat/completions';
  if(!apiKey||/[\u0000-\u0020\u007f-\u009f]/.test(apiKey))throw new HttpError(400,'INVALID_API_KEY');
  if(!/^[-A-Za-z0-9._~]{1,256}$/.test(idempotencyKey)||!/^[-A-Za-z0-9._~]{1,256}$/.test(textSessionId)||Buffer.byteLength(body)>256*1024)throw new HttpError(400,'INVALID_REQUEST');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
  try{
   const hostname=hostName(endpoint),literal=isIP(hostname),addresses=literal?[{address:hostname,family:literal}]:await bounded(this.adapters.resolve(hostname),controller.signal);
   if(!addresses.length||addresses.some(address=>address.family!==isIP(address.address)||!publicAddress(address.address)))throw new HttpError(400,'OUTBOUND_BLOCKED');
   const selected=addresses[0]!,response=await bounded(this.adapters.request({url:endpoint.href,address:selected.address,family:selected.family as 4|6,apiKey,signal:controller.signal,maxBytes:1024*1024,method:'POST',body:Buffer.from(body),idempotencyKey,textSessionId}),controller.signal);
   if(response.status>=300&&response.status<400)throw new HttpError(502,'UPSTREAM_FAILED');if(response.body.length>1024*1024)throw new HttpError(502,'UPSTREAM_TOO_LARGE');return response;
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'UPSTREAM_FAILED');}finally{clearTimeout(timer);}
 }
 async models(channel:ModelChannel,base:string,apiKey:string):Promise<OutboundResponse>{
  const normalized=normalizeModelBase(base),url=new URL(normalized);
  if(!apiKey||/[\u0000-\u0020\u007f-\u009f]/.test(apiKey))throw new HttpError(400,'INVALID_API_KEY');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const hostname=hostName(url),literal=isIP(hostname);
   const addresses=literal?[{address:hostname,family:literal}]:await bounded(this.adapters.resolve(hostname),controller.signal);
   if(!addresses.length||addresses.some(a=>a.family!==isIP(a.address)||!publicAddress(a.address)))throw new HttpError(400,'OUTBOUND_BLOCKED');
   const selected=addresses[0]!;
   const read=async(path:'healthz'|'v1/models')=>{
    const endpoint=new URL(normalized);endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/'+path;
    const response=await bounded(this.adapters.request({url:endpoint.href,address:selected.address,family:selected.family as 4|6,apiKey,signal:controller.signal,maxBytes:8*1024*1024}),controller.signal);
    if(response.status>=300&&response.status<400)throw new HttpError(502,'UPSTREAM_FAILED');
    if(response.body.length>8*1024*1024)throw new HttpError(502,'UPSTREAM_TOO_LARGE');
    return response;
   };
   if(channel==='video'){
    // healthz只按网关明确协议使用：有则读，无（含404/405/501、异常、非JSON）一律视为无该端点的兼容网关，
    // 继续读模型目录。目录访问才是连通判据，healthz永不单独决定连接成功或失败。
    try{await read('healthz');}catch{/* healthz never gates the catalog check */}
   }
   return await read('v1/models');
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'UPSTREAM_FAILED');}
  finally{clearTimeout(timer);}
 }
 async modelsNext(base:string,next:string,apiKey:string):Promise<OutboundResponse|null>{
   // 分页跟随仅限与当前地址同源的下一页；跨域地址不发送密钥，调用方记为未完整获取。
   const normalized=normalizeModelBase(base);
   let url:URL;try{url=new URL(next,normalized.replace(/\/$/,'')+'/');}catch{return null;}
   if(url.protocol!=='https:'||url.origin!==new URL(normalized).origin)return null;
   if(!apiKey||/[\u0000-\u0020\u007f-\u009f]/.test(apiKey))throw new HttpError(400,'INVALID_API_KEY');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   try{
    const hostname=hostName(url),literal=isIP(hostname);
    const addresses=literal?[{address:hostname,family:literal}]:await bounded(this.adapters.resolve(hostname),controller.signal);
    if(!addresses.length||addresses.some(a=>a.family!==isIP(a.address)||!publicAddress(a.address)))throw new HttpError(400,'OUTBOUND_BLOCKED');
    const selected=addresses[0]!;
    const response=await bounded(this.adapters.request({url:url.href,address:selected.address,family:selected.family as 4|6,apiKey,signal:controller.signal,maxBytes:8*1024*1024}),controller.signal);
    if(response.status>=300&&response.status<400)throw new HttpError(502,'UPSTREAM_FAILED');
    if(response.body.length>8*1024*1024)throw new HttpError(502,'UPSTREAM_TOO_LARGE');
    return response;
   }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'UPSTREAM_FAILED');}
   finally{clearTimeout(timer);}
  }
}
