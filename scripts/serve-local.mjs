import {createServer,request as httpRequest} from 'node:http';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {allowedCorePath,requiresCoreIdempotency} from '../src/adapters/core/route-policy.ts';
import {isOpenCodeGoTarget,isValidTextSessionId} from '../src/adapters/text/session-policy.ts';
const own=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
function noSecrets(value){if(!value||typeof value!=='object')return;for(const [name,child] of Object.entries(value)){if(/key|token|jwt|authorization|cookie|password|secret|credential/i.test(name))throw Error('runtime_credentials_denied');noSecrets(child);}}
function fixedOrigin(value){const url=new URL(value);if(url.origin!==value||url.username||url.password||url.hash||url.search||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('fixed_core_origin_required');return value;}
export function validateRuntime(value){
 noSecrets(value);if(value?.host!=='127.0.0.1')throw Error('localhost_only');
 if(!own(value,['schemaVersion','host','port','connections','coreTargets'])||value.schemaVersion!==1||!Number.isInteger(value.port)||value.port<0||value.port>65535||!Array.isArray(value.connections)||!Array.isArray(value.coreTargets)||value.connections.length>20||value.coreTargets.length>20)throw Error('runtime_invalid');
 const ids=new Set(),bases=new Set();
 for(const entry of value.connections){if(!own(entry,['profile','contract'])||!own(entry.profile,['id','name','originSnapshot','proxyBase','contractVersion'])||typeof entry.profile.id!=='string'||!entry.profile.id||typeof entry.profile.name!=='string'||typeof entry.profile.contractVersion!=='string'||entry.contract?.version!==entry.profile.contractVersion||ids.has(entry.profile.id))throw Error('registration_invalid');fixedOrigin(entry.profile.originSnapshot);if(!/^\/core-api(?:\/registered\/[A-Za-z0-9_-]+)?$/.test(entry.profile.proxyBase)||bases.has(entry.profile.proxyBase))throw Error('proxy_binding_invalid');ids.add(entry.profile.id);bases.add(entry.profile.proxyBase);}
 const targets=new Set();for(const target of value.coreTargets){if(!own(target,['proxyBase','origin','allowWrites'])||typeof target.allowWrites!=='boolean'||targets.has(target.proxyBase))throw Error('proxy_target_invalid');fixedOrigin(target.origin);if(!value.connections.some(e=>e.profile.proxyBase===target.proxyBase&&e.profile.originSnapshot===target.origin))throw Error('proxy_target_not_registered');targets.add(target.proxyBase);}return structuredClone(value);
}
export const offlineRuntime={schemaVersion:1,host:'127.0.0.1',port:4188,connections:[],coreTargets:[]};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const inside=(root,file)=>{const part=relative(root,file);return part===''||!isAbsolute(part)&&part!=='..'&&!part.startsWith('..'+sep);};
const reply=(res,status,code)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:{code}}));};
function securityHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');
 // The explicitly paired loopback companion is allowed. Core remains same-origin.
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");}
async function proxy(req,res,target,path){
 const allowed=target.kind==='text'?(req.method==='GET'&&path==='/v1/models'||req.method==='POST'&&path==='/v1/chat/completions'):allowedCorePath(path,req.method);
 if(!allowed)return reply(res,403,'core_route_denied');if(req.method==='POST'&&!target.allowWrites)return reply(res,403,'runtime_writes_disabled');
 const textSession=req.headers['x-opencode-session'];if(target.kind==='text'&&textSession!==undefined&&!isValidTextSessionId(textSession))return reply(res,400,'text_session_invalid');
 if(target.kind==='text'&&req.method==='POST'&&isOpenCodeGoTarget(target.origin)&&textSession===undefined)return reply(res,400,'text_session_required');
 if(req.method==='POST'&&requiresCoreIdempotency(path)&&!/^[-A-Za-z0-9._~]{1,256}$/.test(req.headers['idempotency-key']??''))return reply(res,400,'core_idempotency_required');
 if(req.method==='POST'&&req.headers['content-type']?.split(';')[0]!=='application/json'||req.headers['content-encoding'])return reply(res,415,'request_encoding_denied');
 const parts=[];let length=0;const max=path==='/v1/assets'?46*1024*1024:8*1024*1024;for await(const part of req){length+=part.length;if(length>max)return reply(res,413,'request_too_large');parts.push(part);}if(req.method==='GET'&&length)return reply(res,400,'get_body_denied');
 const headers={Accept:'application/json','Accept-Encoding':'identity'};for(const key of ['authorization','content-type','idempotency-key'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];if(length)headers['Content-Length']=String(length);
 if(target.kind==='text'){headers['User-Agent']='AIWorkStudio/0.0.1';if(textSession!==undefined)headers['x-opencode-session']=textSession;}
 const url=new URL(target.origin+path),send=url.protocol==='https:'?httpsRequest:httpRequest;
 // Non-stream text generation can outlast 30s. Cover the application's bounded
 // 60s default / 120s maximum; caller abort still closes its upstream socket.
 const idleTimeoutMs=target.kind==='text'&&req.method==='POST'&&path==='/v1/chat/completions'?120000:30000;
 await new Promise(resolveRequest=>{const upstream=send(url,{method:req.method,headers},incoming=>{const status=incoming.statusCode??502;if(status>=300&&status<400){incoming.resume();reply(res,502,'core_redirect_denied');resolveRequest();return;}for(const name of ['content-type','content-length','content-encoding','retry-after'])if(incoming.headers[name]!==undefined)res.setHeader(name,incoming.headers[name]);res.statusCode=status;incoming.on('error',()=>{res.destroy();resolveRequest();});incoming.on('end',resolveRequest);incoming.pipe(res);});upstream.setTimeout(idleTimeoutMs,()=>upstream.destroy(Error('timeout')));upstream.on('error',()=>{if(!res.headersSent)reply(res,502,'core_transport_unknown');else res.destroy();resolveRequest();});res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});upstream.end(length?Buffer.concat(parts):undefined);});
}

function registrationInput(raw){
 noSecrets(raw);
 if(!own(raw,['kind','name','origin'])||!['core','text'].includes(raw.kind)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>120||typeof raw.origin!=='string'||/[\\%?#\s\u0000-\u001f]/.test(raw.origin))throw Error('registration_invalid');
 if(/(?:^|\/)\.\.?(?:$|\/)/.test(raw.origin))throw Error('registration_invalid');
 const url=new URL(raw.origin),local=['127.0.0.1','localhost'].includes(url.hostname);
 if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&local)||url.hash||url.search||url.pathname.includes('//')||url.pathname.split('/').some(p=>['.','..','admin','internal','bridge'].includes(p.toLowerCase())))throw Error('registration_invalid');
 if(!local&&(/^\d+(?:\.\d+){3}$/.test(url.hostname)||url.hostname.startsWith('[')||url.hostname.endsWith('.localhost')))throw Error('public_hostname_required');
 const pathname=url.pathname.replace(/\/$/,''),textPath=raw.kind==='text'?pathname.replace(/\/v1\/chat\/completions$/,'/v1'):pathname;
 const base=url.origin+textPath.replace(/\/v1$/,'');
 if(raw.kind==='core'&&base!==url.origin)throw Error('core_origin_required');
 return {kind:raw.kind,name:raw.name.trim(),origin:base};
}
function readOnlyContract(){return {version:'unverified',verification:'unknown',evidence:[],routes:{models:true,videoSubmit:false,videoQuery:false,videoContent:false,chat:false,assets:false,workContext:false,continuation:false,backup:false},textModels:[],videoModels:[],videoAliases:[],videoSpecs:[],limits:{}};}
export function createSettingsHandler(config){
 const nonce=randomBytes(32).toString('hex'),texts=new Map();
 return async function handle(req,res,decoded,port){
  if(decoded==='/studio-deployment.json'&&['GET','HEAD'].includes(req.method)){
   const connections=[...config.connections,...[...texts.values()].map(entry=>({profile:entry.profile,contract:{...readOnlyContract(),version:entry.profile.contractVersion,routes:{...readOnlyContract().routes,chat:true}}}))];
   res.setHeader('Content-Type','application/json; charset=utf-8');res.end(req.method==='HEAD'?undefined:JSON.stringify({schemaVersion:1,connections}));return true;
  }
  if(decoded==='/studio-session.json'){
   if(req.method!=='GET'||req.headers['x-studio-settings']!=='1')return reply(res,403,'settings_session_denied'),true;
   res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({nonce}));return true;
  }
  if(decoded==='/studio-api/connections'){
   const token=req.headers['x-studio-session'],valid=typeof token==='string'&&token.length===nonce.length&&timingSafeEqual(Buffer.from(token),Buffer.from(nonce));
   if(req.method!=='POST'||!valid||!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return reply(res,403,'settings_authorization_required'),true;
   if(req.headers['content-type']?.split(';')[0]!=='application/json'||req.headers['content-encoding'])return reply(res,415,'request_encoding_denied'),true;
   let bytes=0;const parts=[];for await(const part of req){bytes+=part.length;if(bytes>65536)return reply(res,413,'registration_too_large'),true;parts.push(part);}
   let input;try{input=registrationInput(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{return reply(res,400,'registration_invalid'),true;}
   const existing=input.kind==='core'?config.connections.find(e=>e.profile.originSnapshot===input.origin):[...texts.values()].find(e=>e.profile.originSnapshot===input.origin);
   if(existing){res.writeHead(201,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(existing));return true;}
   if(config.connections.length+texts.size>=20)return reply(res,409,'registration_limit'),true;
   const id='user-'+createHash('sha256').update(input.kind+':'+input.origin).digest('hex').slice(0,24),profile={id,name:input.name,originSnapshot:input.origin,proxyBase:(input.kind==='core'?'/core-api':'/text-api')+'/registered/'+id,contractVersion:input.kind==='core'?'unverified':'openai-compatible-text-v1'},entry={profile,...(input.kind==='core'?{contract:readOnlyContract()}:{})};
   if(input.kind==='core'){config.connections.push(entry);config.coreTargets.push({proxyBase:profile.proxyBase,origin:input.origin,allowWrites:false});}else texts.set(profile.proxyBase,entry);
   res.writeHead(201,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(entry));return true;
  }
  if(decoded.startsWith('/text-api')){
   const entry=[...texts.values()].find(e=>decoded.startsWith(e.profile.proxyBase+'/'));
   const path=entry?decoded.slice(entry.profile.proxyBase.length):'';
   if(!entry)return reply(res,403,'text_target_not_registered'),true;
   await proxy(req,res,{kind:'text',origin:entry.profile.originSnapshot,allowWrites:true},path);return true;
  }
  return false;
 };
}

export function createLocalServer({root='dist',runtime=offlineRuntime}={}){
 const config=validateRuntime(runtime),absolute=resolve(root),settings=createSettingsHandler(config);const server=createServer(async(req,res)=>{securityHeaders(res);try{
  const address=server.address(),port=address&&typeof address==='object'?address.port:config.port;
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return reply(res,403,'host_or_origin_denied');
  const raw=req.url??'/';if(!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f]/.test(raw))return reply(res,403,'path_denied');const decoded=decodeURIComponent(raw.split('?')[0]);if(decoded.split('/').some(part=>part==='..'||part==='.')||decoded.includes('\\'))return reply(res,403,'path_denied');
  if((decoded.startsWith('/studio-api')||decoded.startsWith('/text-api')||decoded==='/studio-session.json')&&(raw.includes('?')||raw.includes('%')))return reply(res,403,'settings_path_denied');
  if(await settings(req,res,decoded,port))return;
  if(decoded.startsWith('/core-api')){if(raw.includes('?')||raw.includes('%'))return reply(res,403,'core_route_denied');const target=config.coreTargets.filter(t=>decoded.startsWith(t.proxyBase+'/')).sort((a,b)=>b.proxyBase.length-a.proxyBase.length)[0],path=target?decoded.slice(target.proxyBase.length):decoded.slice('/core-api'.length);if(!allowedCorePath(path,req.method))return reply(res,403,'core_route_denied');if(!target)return reply(res,503,'core_not_configured');return await proxy(req,res,target,path);}
  if(!['GET','HEAD'].includes(req.method))return reply(res,405,'static_method_denied');if(decoded==='/studio-deployment.json'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(req.method==='HEAD'?undefined:JSON.stringify({schemaVersion:1,connections:config.connections}));}if(decoded.split('/').some(part=>part.startsWith('.')))return reply(res,404,'static_not_found');
  const realRoot=await realpath(absolute);let file=resolve(absolute,'.'+(decoded==='/'?'/index.html':decoded));if(!inside(absolute,file))return reply(res,403,'path_denied');try{if(!(await stat(file)).isFile())throw Error('not_file');}catch{if(extname(decoded))return reply(res,404,'static_not_found');file=resolve(absolute,'index.html');}const actual=await realpath(file);if(!inside(realRoot,actual)||!mime[extname(actual)])return reply(res,404,'static_not_found');const bytes=await readFile(actual);res.setHeader('Content-Type',mime[extname(actual)]);res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?undefined:bytes);
 }catch{if(!res.headersSent)reply(res,400,'request_rejected');else res.destroy();}});server.requestTimeout=35000;server.headersTimeout=10000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const option=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};const file=option('--runtime',undefined),runtime=file?validateRuntime(JSON.parse(await readFile(file,'utf8'))):structuredClone(offlineRuntime);runtime.port=Number(option('--port',runtime.port));validateRuntime(runtime);const server=createLocalServer({root:option('--root','dist'),runtime});server.on('error',()=>{console.error('Local startup failed; no alternate host or port selected.');process.exitCode=1;});server.listen(runtime.port,'127.0.0.1',()=>console.log('AI WORK Studio http://127.0.0.1:'+server.address().port+' · '+(runtime.coreTargets.length?'fixed registered Core targets':'offline, Core disabled')));}
