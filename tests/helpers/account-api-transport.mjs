// Verification harness only. Installed Playwright 1.58.2 private seam is
// version-pinned and fails closed. No product network/security code imported.
import {createRequire} from 'node:module';
import path from 'node:path';
import {assertStrictTlsEnvironment} from '../../scripts/account-tls-environment.mjs';
import {assertDomainAdapterExecutionReady,assertDomainResolverInstalled,assertDomainLoopbackPolicy} from '../../scripts/account-domain-test-policy.mjs';
const require=createRequire(import.meta.url);
const packageRoot=path.dirname(require.resolve('playwright-core/package.json'));
const {APIRequest,APIRequestContext}=require(path.join(packageRoot,'lib/client/fetch.js'));
const {Browser}=require(path.join(packageRoot,'lib/client/browser.js'));
const {BrowserContext,prepareBrowserContextParams}=require(path.join(packageRoot,'lib/client/browserContext.js'));
const {headersObjectToArray}=require(path.join(packageRoot,'lib/utils/isomorphic/headers.js'));
const browserOrigins=new WeakMap();
const version=require(path.join(packageRoot,'package.json')).version;
const owners=new WeakMap();let runtime,active;
const fail=reason=>new Error('Account API boundary: '+reason);
const factoryKeys=new Set(['baseURL','ignoreHTTPSErrors','maxRedirects','timeout','userAgent','extraHTTPHeaders','failOnStatusCode','proxy','httpCredentials','clientCertificates','storageState']);
const fetchKeys=new Set(['url','request','method','data','headers','params','timeout','failOnStatusCode','ignoreHTTPSErrors','maxRedirects','maxRetries']);
const routes=new Map([['/studio-api/session',['GET']],['/studio-api/auth/bootstrap',['GET']],['/studio-api/auth/register',['POST']],['/studio-api/auth/login',['POST']],['/studio-api/auth/logout',['POST']],['/studio-api/me/document',['GET','PATCH']],['/studio-api/me/onboarding',['PATCH']],['/studio-api/me/model-configs',['GET']],['/studio-api/me/model-configs/text',['PATCH']],['/studio-api/me/model-configs/video',['PATCH']],['/studio-api/me/model-configs/text/test',['POST']],['/studio-api/me/model-configs/video/test',['POST']]]);
function environment(){assertStrictTlsEnvironment();for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])if(process.env[key])throw fail('alternate TLS trust or proxy environment');}
function headers(value,origin){
 const result={};const entries=value===undefined?[]:Array.isArray(value)?value.map(h=>[h.name,h.value]):Object.entries(value);
 for(const [name,entry] of entries){if(typeof name!=='string'||typeof entry!=='string'||/[\r\n]/.test(name+entry))throw fail('invalid headers');const lower=name.toLowerCase();if(['host',':authority'].includes(lower)&&entry!==new URL(origin).host)throw fail('host override');if(lower==='origin'&&entry!==origin)throw fail('origin override');if(['forwarded','x-forwarded-host','x-forwarded-proto','x-original-url','x-rewrite-url','proxy-authorization'].includes(lower))throw fail('routing override');result[name]=entry;}
 return result;
}
function strictOptions(options){if(options.ignoreHTTPSErrors!==undefined&&options.ignoreHTTPSErrors!==false)throw fail('TLS bypass forbidden');if(options.maxRedirects!==undefined&&options.maxRedirects!==0)throw fail('automatic redirects forbidden');if(options.maxRetries!==undefined&&options.maxRetries!==0)throw fail('retries forbidden');}
function configureFactory(owner,options){
 for(const key of Object.keys(options))if(!factoryKeys.has(key))throw fail('unreviewed context option');strictOptions(options);
 for(const key of ['proxy','httpCredentials','clientCertificates','storageState'])if(options[key]!==undefined)throw fail('unsafe context default: '+key);
 if(options.baseURL!==undefined&&options.baseURL!==owner.origin&&options.baseURL!==owner.origin+'/')throw fail('base URL outside exact origin');
 // Explicit protected keys stop the official test instrumentation from
 // filling unsafe defaults. In 1.58.2, per-call false cannot override a
 // context's true ignoreHTTPSErrors (server uses an OR condition).
 return {...options,baseURL:owner.origin,ignoreHTTPSErrors:false,maxRedirects:0,proxy:undefined,httpCredentials:undefined,clientCertificates:undefined,storageState:undefined,extraHTTPHeaders:headers(options.extraHTTPHeaders,owner.origin)};
}
function configureBrowser(owner,browser,options){
 if(!(browser instanceof Browser)||!browser._options)throw fail('unreviewed browser implementation');
 strictOptions(options);for(const key of ['proxy','httpCredentials','clientCertificates','storageState'])if(options[key]!==undefined&&!(key==='clientCertificates'&&Array.isArray(options[key])&&options[key].length===0))throw fail('unsafe browser context default');
 if(browser._options.proxy!==undefined)throw fail('unsafe browser proxy default');
 if(owner.mode==='domain'&&(!browser._options.args?.includes('--host-resolver-rules=MAP studio.gemstory.cn 127.0.0.1')||!browser._options.args?.includes('--no-proxy-server')))throw fail('missing fixed browser resolution');
 if(options.baseURL!==undefined&&options.baseURL!==owner.origin&&options.baseURL!==owner.origin+'/')throw fail('browser base URL outside exact origin');
 return {...options,baseURL:owner.origin,ignoreHTTPSErrors:false,proxy:undefined,httpCredentials:undefined,clientCertificates:undefined,storageState:undefined,extraHTTPHeaders:headers(options.extraHTTPHeaders,owner.origin),serviceWorkers:'block'};
}
function register(owner,request){if(!(request instanceof APIRequestContext))throw fail('unreviewed API context implementation');const old=owners.get(request);if(old&&old!==owner)throw fail('API context owned by another boundary');owners.set(request,owner);owner.contexts.add(request);}
function install(mode){
 if(version!=='1.58.2'||typeof APIRequest.prototype.newContext!=='function'||typeof APIRequestContext.prototype._innerFetch!=='function'||typeof Browser.prototype._innerNewContext!=='function'||typeof BrowserContext.prototype.setExtraHTTPHeaders!=='function'||typeof prepareBrowserContextParams!=='function'||typeof headersObjectToArray!=='function')throw fail('unreviewed Playwright transport version');
 if(runtime){if(APIRequest.prototype.newContext!==runtime.factory||APIRequestContext.prototype._innerFetch!==runtime.fetch||Browser.prototype._innerNewContext!==runtime.browserFactory||BrowserContext.prototype.setExtraHTTPHeaders!==runtime.setHeaders)throw fail('transport hook changed');if(mode==='domain')runtime.mode='domain';return;}
 const originalFactory=APIRequest.prototype.newContext,originalFetch=APIRequestContext.prototype._innerFetch,originalBrowserFactory=Browser.prototype._innerNewContext,originalSetHeaders=BrowserContext.prototype.setExtraHTTPHeaders;
 const currentOwner=owner=>{if(owner.closed||active!==owner)throw fail('closed during context creation');};
 // Pinned 1.58.2 creation flow: preserve instrumentation and native bookkeeping,
 // but validate its final options after all before-create callbacks, before
 // certificate/storage file reads or a protocol creation request.
 const factory=async function(options={}){
  const owner=active;if(!owner||owner.closed)throw fail('inactive API factory');let context;
  try{
   const mutable=configureFactory(owner,options);
   await this._playwright._instrumentation.runBeforeCreateRequestContext(mutable);currentOwner(owner);
   const sanitized=configureFactory(owner,mutable);
   const response=await this._playwright._channel.newRequest({...sanitized,extraHTTPHeaders:headersObjectToArray(sanitized.extraHTTPHeaders),tracesDir:this._playwright._defaultLaunchOptions?.tracesDir});
   context=APIRequestContext.from(response.request);currentOwner(owner);
   this._contexts.add(context);context._request=this;
   context._timeoutSettings.setDefaultTimeout(sanitized.timeout??this._playwright._defaultContextTimeout);
   context._tracing._tracesDir=this._playwright._defaultLaunchOptions?.tracesDir;
   await context._instrumentation.runAfterCreateRequestContext(context);currentOwner(owner);
   register(owner,context);return context;
  }catch(error){owner.blockedCreations++;await context?.dispose({reason:'Rejected account API creation'}).catch(()=>{});throw error;}
 };
 const browserFactory=async function(options={},forReuse){
  const owner=active;if(!owner||owner.closed)throw fail('inactive browser context factory');let context;
  try{
   const initial=configureBrowser(owner,this,options);if(forReuse)throw fail('reused browser contexts forbidden');
   const mutable=this._browserType._playwright.selectors._withSelectorOptions(initial);
   await this._instrumentation.runBeforeCreateBrowserContext(mutable);currentOwner(owner);
   const sanitized=configureBrowser(owner,this,mutable);
   const protocolOptions=await prepareBrowserContextParams(this._platform,sanitized);currentOwner(owner);
   const response=await this._channel.newContext(protocolOptions);
   context=BrowserContext.from(response.context);currentOwner(owner);
   const request=APIRequestContext.from(context._initializer.requestContext);
   if(!(context instanceof BrowserContext)||!(request instanceof APIRequestContext)||context.request!==request||context.browser()!==this)throw fail('unverified native browser/request association');
   const provenance={owner,request,browser:this,ready:false};browserOrigins.set(context,provenance);
   if(sanitized.logger)context._logger=sanitized.logger;
   await context._initializeHarFromOptions(sanitized.recordHar);
   await this._instrumentation.runAfterCreateBrowserContext(context);currentOwner(owner);
   if(context.request!==request||context.browser()!==this)throw fail('browser/request changed during creation');
   provenance.ready=true;return context;
  }catch(error){owner.blockedCreations++;if(context)browserOrigins.delete(context);await context?.close().catch(()=>{});throw error;}
 };
 const setHeaders=async function(value){
  const provenance=browserOrigins.get(this),owner=provenance?.owner;
  if(!owner||owner.closed||active!==owner||provenance.request!==this.request||provenance.browser!==this.browser())throw fail('inactive or unverified browser header update');
  try{return await Reflect.apply(originalSetHeaders,this,[headers(value,owner.origin)]);}catch(error){if(error instanceof Error&&error.message.startsWith('Account API boundary:'))owner.blocked++;throw error;}
 };
 const fetch=async function(options={}){const owner=owners.get(this);if(!owner||owner.closed||active!==owner){if(active)active.blocked++;throw fail('inactive or unregistered API context');}if(APIRequest.prototype.newContext!==factory||APIRequestContext.prototype._innerFetch!==fetch||Browser.prototype._innerNewContext!==browserFactory||BrowserContext.prototype.setExtraHTTPHeaders!==setHeaders)throw fail('transport hook changed');try{
   for(const key of Object.keys(options))if(!fetchKeys.has(key))throw fail('unreviewed request option');strictOptions(options);
   const raw=options.url??options.request?.url();if(typeof raw!=='string')throw fail('URL string or reviewed Request required');const url=new URL(raw,owner.origin);
   if(url.origin!==owner.origin||url.username||url.password)throw fail('URL outside exact origin');
   let decoded=url.pathname;for(let i=0;i<4;i++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{throw fail('malformed encoded path');}}
   if(/(?:^|\/)(?:generations|completions|uploads|video\/submit)(?:\/|$)/.test(decoded)){owner.paid++;throw fail('paid path forbidden');}
   const method=String(options.method??options.request?.method()??'GET').toUpperCase();if(url.pathname.includes('%')||!routes.get(url.pathname)?.includes(method))throw fail('unlisted account path or method');
   const checkedHeaders=headers(options.headers??options.request?.headers(),owner.origin);owner.requests++;
   return await Reflect.apply(originalFetch,this,[{...options,url:url.href,method,headers:checkedHeaders,ignoreHTTPSErrors:false,maxRedirects:0,maxRetries:0}]);
  }catch(error){if(error instanceof Error&&error.message.startsWith('Account API boundary:'))owner.blocked++;throw error;}};
 APIRequest.prototype.newContext=factory;APIRequestContext.prototype._innerFetch=fetch;Browser.prototype._innerNewContext=browserFactory;BrowserContext.prototype.setExtraHTTPHeaders=setHeaders;runtime={mode,originalFactory,originalFetch,originalBrowserFactory,originalSetHeaders,factory,fetch,browserFactory,setHeaders};
}
function boundary(origin,mode){
 const owner={origin,mode,contexts:new Set(),closed:false,requests:0,blocked:0,blockedCreations:0,blockedRegistrations:0,paid:0};
 return Object.freeze({
  activate(){environment();install(mode);if(active&&active!==owner)throw fail('overlapping API boundaries');if(owner.closed)throw fail('closed API boundary');active=owner;},
  registerBrowserContext(context){try{
   if(active!==owner||owner.closed)throw fail('inactive browser registration');const provenance=browserOrigins.get(context);
   if(!provenance?.ready||provenance.owner!==owner||provenance.request!==context.request||provenance.browser!==context.browser())throw fail('unverified browser/request creation provenance');
   register(owner,provenance.request);
  }catch(error){owner.blockedRegistrations++;throw error;}},
  evidence:()=>({observedApiRequests:owner.requests,blockedApiRequests:owner.blocked,blockedApiCreations:owner.blockedCreations,blockedApiRegistrations:owner.blockedRegistrations,blockedApiOperations:owner.blocked+owner.blockedCreations+owner.blockedRegistrations,paidApiRequests:owner.paid,registeredApiContexts:owner.contexts.size}),
  async close(){if(owner.closed)return;owner.closed=true;if(active===owner)active=undefined;for(const context of owner.contexts)await context.dispose({reason:'Account API boundary closed'});owner.contexts.clear();},
 });
}
/** Local fake transport tests only; caller cannot supply a remote origin. */
export function createLoopbackAccountApiBoundary(origin){const url=new URL(origin);if(url.origin!==origin||url.hostname!=='127.0.0.1'||!['http:','https:'].includes(url.protocol))throw fail('literal loopback test origin required');return boundary(origin,'loopback');}
export function createDomainAccountApiBoundary(policy){assertDomainResolverInstalled();const reviewed=assertDomainLoopbackPolicy(policy);return boundary(reviewed.origin,'domain');}
export function installDomainAccountApiTransport(){assertDomainAdapterExecutionReady();assertDomainResolverInstalled();environment();install('domain');}
export function restoreLoopbackApiRuntimeForTests(){if(!runtime)return;if(runtime.mode!=='loopback'||active)throw fail('cannot restore active or domain runtime');if(APIRequest.prototype.newContext!==runtime.factory||APIRequestContext.prototype._innerFetch!==runtime.fetch||Browser.prototype._innerNewContext!==runtime.browserFactory||BrowserContext.prototype.setExtraHTTPHeaders!==runtime.setHeaders)throw fail('cannot restore foreign transport hooks');APIRequest.prototype.newContext=runtime.originalFactory;APIRequestContext.prototype._innerFetch=runtime.originalFetch;Browser.prototype._innerNewContext=runtime.originalBrowserFactory;BrowserContext.prototype.setExtraHTTPHeaders=runtime.originalSetHeaders;runtime=undefined;}
