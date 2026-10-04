import type {CoreClient} from '../../adapters/core/http-client';
import type {ConnectionProfile} from '../../domain/connection';
import {connectionSchema} from '../../domain/connection';
import {getActiveCore} from '../../adapters/core/current-connection';
import {getIndependentText,subscribeTextConnection,canDeclareTextModel} from '../../adapters/text/current-text';
import {hasSessionCredential,credentialRevision,subscribeSessionCredentials} from '../../security/credential-session';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
export type ConnectionChannel='text'|'video';
type StatusInput={configured:boolean;authorized:boolean;channel?:ConnectionChannel;checking?:boolean;readonlyVerified?:boolean;stale?:boolean;draftChanged?:boolean;model?:string;modelAvailable?:boolean;capabilityVerified?:boolean;fallbackUnverified?:boolean;enabled?:boolean;failure?:string;generationVerified?:boolean};
export function deriveConnectionStatus(input:StatusInput){
 const result=(code:string,label:string,tone='neutral')=>({code,label,tone});
 if(!input.configured)return result('missing','配置缺失');
 if(input.draftChanged)return result('unverified','配置已变更 · 待连接测试','pending');
 if(input.checking)return result('checking','检测中…','checking');
 if(input.failure)return result('failed','检测失败','failed');
 if(!input.authorized)return result('unauthorized','已配置 · 本标签页未授权','pending');
 if(!input.readonlyVerified||input.stale)return result('unverified',input.stale?'目录已过期 · 待重新核验':'已配置 · 未验证','pending');
 if(input.fallbackUnverified)return result('fallback-unverified','Core 文字能力待核验','pending');
 if(input.model!==undefined&&!input.model)return result('model-required','目录可用 · 待选模型','pending');
 if(input.modelAvailable===false)return result('model-unavailable','模型不可用 · 请重新选择','failed');
 if(input.channel==='video'&&input.capabilityVerified===false)return result('capability-unverified','目录可用 · 视频能力待核验','pending');
 if(input.channel==='text'&&input.enabled===false)return result('enable-required','目录可用 · 待启用文字','pending');
 if(input.generationVerified)return result('generated','真实生成已验证','success');
 return result('readonly','已连接 · 生成待验证','success');
}
export function safeConnectionFailure(error:unknown){
 const value=error&&typeof error==='object'?error as {httpStatus?:unknown;category?:unknown;message?:unknown}:{};
 const status=typeof value.httpStatus==='number'&&Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599?'HTTP '+value.httpStatus+' · ':'';
 const reasons:Record<string,string>={authentication:'凭据未通过验证',forbidden:'服务拒绝访问',quota:'额度受限',rate_limited:'服务限流',not_found:'接口或模型未找到',unavailable:'服务暂不可用',protocol:'响应协议无效'};
 return status+(value.message==='connection_check_timeout'?'连接测试超时':typeof value.category==='string'&&Object.hasOwn(reasons,value.category)?reasons[value.category]:'未取得可核验结果');
}
const listeners=new Set<()=>void>();
const notify=()=>{for(const listener of listeners)listener();};
export function subscribeConnectionStatus(listener:()=>void){listeners.add(listener);const stopKey=subscribeSessionCredentials(listener),stopConnection=subscribeTextConnection(listener);return()=>{listeners.delete(listener);stopKey();stopConnection();};}
const identity=(client:CoreClient)=>JSON.stringify([client.profile.id,client.profile.originSnapshot,client.profile.proxyBase,client.profile.contractVersion,client.binding.id,credentialRevision(client.binding.id)]);
type CheckContext={signal:AbortSignal;assertCurrent:()=>void};
export function guardCheckTransaction(context:CheckContext,tx:IDBTransaction){context.assertCurrent();const abort=()=>{try{tx.abort();}catch{/* Transaction already finished. */}};context.signal.addEventListener('abort',abort,{once:true});const clean=()=>context.signal.removeEventListener('abort',abort);for(const event of ['complete','abort','error'])tx.addEventListener(event,clean,{once:true});}
type Check={stamp:string;controller:AbortController;promise:Promise<unknown>;reject:(reason:Error)=>void};
const checks=new Map<ConnectionChannel,Check>();
export function isConnectionChecking(channel:ConnectionChannel){return !!checks.get(channel)&&!checks.get(channel)!.controller.signal.aborted;}
export function cancelConnectionCheck(channel:ConnectionChannel){const check=checks.get(channel);if(check){check.controller.abort();check.reject(Error('connection_check_obsolete'));notify();}}
export function runConnectionCheck<T>(channel:ConnectionChannel,client:CoreClient,work:(context:CheckContext)=>Promise<T>,timeoutMs=15000):Promise<T>{
 const stamp=identity(client),prior=checks.get(channel);if(prior?.stamp===stamp&&!prior.controller.signal.aborted)return prior.promise as Promise<T>;
 cancelConnectionCheck(channel);if(!hasSessionCredential(client.binding.id))return Promise.reject(Error('session_credential_required'));
 const controller=new AbortController();let reject!:(reason:Error)=>void;
 const interrupted=new Promise<never>((_,stop)=>{reject=stop;});
 const check:Check={stamp,controller,reject,promise:Promise.resolve()};checks.set(channel,check);
 const assertCurrent=()=>{if(checks.get(channel)!==check||controller.signal.aborted||identity(client)!==stamp||!hasSessionCredential(client.binding.id))throw Error('connection_check_obsolete');};
 const stopKey=subscribeSessionCredentials(()=>{if(identity(client)!==stamp||!hasSessionCredential(client.binding.id)){controller.abort();reject(Error('connection_check_obsolete'));}});
 const timer=setTimeout(()=>{controller.abort();reject(Error('connection_check_timeout'));},timeoutMs);
 check.promise=Promise.race([Promise.resolve().then(()=>{assertCurrent();return work({signal:controller.signal,assertCurrent});}),interrupted]).catch(error=>{
  if(!(error instanceof Error&&error.message==='connection_check_obsolete')&&identity(client)===stamp){const record=records.get(recordId(channel,client.profile));records.set(recordId(channel,client.profile),{...record,profile:client.profile,stamp,verifiedAt:record?.verifiedAt,models:record?.models??[],stale:true,failure:safeConnectionFailure(error)});notify();}throw error;
 }).finally(()=>{clearTimeout(timer);stopKey();if(checks.get(channel)===check){checks.delete(channel);notify();}});
 notify();return check.promise as Promise<T>;
}
type Generation={stamp:string;model:string;spec?:string;at:number;scope:string};
type RecordState={readonlyScope?:string;profile:ConnectionProfile;stamp?:string;verifiedAt?:number;models:string[];stale?:boolean;failure?:string;mock?:boolean;generation?:Generation;generationHistory?:{at:number;scope:string}};
const records=new Map<string,RecordState>(),selected=new Map<ConnectionChannel,ConnectionProfile>(),candidates=new Map<ConnectionChannel,CoreClient>();
const submittedVideos=new Map<string,{spec:string;complete:()=>boolean}>();
export function registerSubmittedVideo(runId:string,spec:string,complete:()=>boolean){if(submittedVideos.size>=200)submittedVideos.delete(submittedVideos.keys().next().value!);submittedVideos.set(runId,{spec,complete});}
export function completeSubmittedVideo(runId:string,spec:string){const observed=submittedVideos.get(runId);submittedVideos.delete(runId);return !!observed&&observed.spec===spec&&observed.complete();}
const recordId=(channel:ConnectionChannel,profile:ConnectionProfile)=>channel+':'+profile.id;
export function videoStatusSpec(model:string,duration:number|null,ratio:string){
 const active=getActiveCore(),unset=duration===null&&!ratio,specs=active?.capability.videoSpecs.filter(s=>s.modelId===model&&(unset||(s.durationSeconds??null)===duration&&(s.ratio??'')===ratio))??[];
 const scope=(s:typeof specs[number])=>JSON.stringify([s.durationSeconds??null,s.ratio??'',s.resolution??'']);
 if(!unset&&specs.length===1)return scope(specs[0]);
 if(!active||!hasSessionCredential(active.client.binding.id))return undefined;
 const record=records.get(recordId('video',active.client.profile)),stamp=identity(active.client),generation=record?.generation;
 // Multiple resolutions cannot broaden a successful request into proof for every option.
 if(record?.stamp!==stamp||record.stale||record.mock||generation?.stamp!==stamp||generation.model!==model)return undefined;
 return specs.some(s=>scope(s)===generation.spec)?generation.spec:undefined;
}
export function configureConnectionStatus(channel:ConnectionChannel,profile:ConnectionProfile){selected.set(channel,profile);notify();}
export function setConnectionStatusCandidate(channel:ConnectionChannel,client?:CoreClient){if(client){candidates.set(channel,client);configureConnectionStatus(channel,client.profile);}else candidates.delete(channel);notify();}
export function rememberReadonlyStatus(channel:ConnectionChannel,client:CoreClient,models:string[],options:{verifiedAt?:number;mock?:boolean;scope?:string}={}){
 const id=recordId(channel,client.profile),previous=records.get(id);records.set(id,{profile:client.profile,stamp:identity(client),models:[...models],readonlyScope:options.scope??(channel==='video'?'健康与模型目录':'模型目录'),verifiedAt:options.verifiedAt??Date.now(),mock:!!options.mock,generation:previous?.stamp===identity(client)?previous.generation:undefined,generationHistory:previous?.generationHistory});configureConnectionStatus(channel,client.profile);if(channel==='video')rememberReadonlyStatus('text',client,models.filter(canDeclareTextModel),{...options,scope:'模型目录'});
}
export function readonlyStatusMetadata(channel:ConnectionChannel,client:CoreClient,verifiedAt:number,models:string[],mock=false,scope=channel==='video'?'健康与模型目录':'模型目录'){return {id:'connection-status:'+recordId(channel,client.profile),kind:'connection-status-history',channel,profile:client.profile,verifiedAt,models,mock,scope,generationHistory:records.get(recordId(channel,client.profile))?.generationHistory};}
// Stored metadata is history only. It cannot restore credentials or current success.
export async function hydrateConnectionStatuses(){
 const rows=await withDatabase(undefined,db=>transact(db,['diagnostics','receipts'],'readonly',async tx=>[...await requestResult<unknown[]>(tx.objectStore('diagnostics').getAll()),...await requestResult<unknown[]>(tx.objectStore('receipts').getAll())]));
 for(const raw of rows){if(!raw||typeof raw!=='object')continue;const r=raw as Record<string,unknown>;if(r.kind!=='connection-status-history'||!['text','video'].includes(String(r.channel)))continue;const parsed=connectionSchema.safeParse(r.profile);if(!parsed.success||typeof r.verifiedAt!=='number'||!Number.isSafeInteger(r.verifiedAt)||r.verifiedAt<=0||!Array.isArray(r.models)||r.models.some(m=>typeof m!=='string'||m.length>256))continue;const channel=r.channel as ConnectionChannel,id=recordId(channel,parsed.data),history=r.generationHistory as {at?:unknown;scope?:unknown}|undefined;const generationHistory=history&&typeof history.at==='number'&&Number.isSafeInteger(history.at)&&history.at>0&&typeof history.scope==='string'&&history.scope.length<=1024?{at:history.at,scope:history.scope}:undefined;if(!records.has(id))records.set(id,{profile:parsed.data,readonlyScope:r.scope==='模型目录'||r.scope==='健康与模型目录'?r.scope:'历史记录（范围未记录）',verifiedAt:r.verifiedAt,models:r.models as string[],mock:r.mock===true,generationHistory});if(!selected.has(channel))selected.set(channel,parsed.data);}
 notify();
}
export type StatusOptions={profile?:ConnectionProfile;client?:CoreClient;model?:string;draftChanged?:boolean;enabled?:boolean;spec?:string;configured?:boolean};
export function connectionStatusView(channel:ConnectionChannel,options:StatusOptions={}){
 const independent=getIndependentText(),active=channel==='video'?getActiveCore():independent??getActiveCore();
 const client=options.client??(options.profile?(active?.client.profile.id===options.profile.id?active.client:candidates.get(channel)?.profile.id===options.profile.id?candidates.get(channel):undefined):candidates.get(channel)??active?.client);
 const profile=options.profile??client?.profile??selected.get(channel),record=profile?records.get(recordId(channel,profile)):undefined;
 const current=!!client&&record?.stamp===identity(client),authorized=!!client&&hasSessionCredential(client.binding.id);
 const model=options.model??(channel==='text'?(independent?.capability.textModels[0]??active?.capability.textModels[0]):undefined);
 const modelAvailable=current&&!record?.stale&&model?record!.models.includes(model)&&(channel!=='text'||canDeclareTextModel(model))?channel==='video'?active?.capability.verification==='unknown'?undefined:active?.capability.videoModels.includes(model):true:false:undefined;
 const enabled=options.enabled??(channel!=='text'||!!independent&&independent.client.binding.id===client?.binding.id||client?.binding.kind==='core-user');
 const generation=record?.generation,generationVerified=!!generation&&authorized&&current&&generation.stamp===identity(client!)&&generation.model===model&&generation.spec===options.spec;
 const draft=options.draftChanged===true||(channel==='video'&&options.configured===false),displayRecord=draft?undefined:record,displayAuthorized=draft?false:authorized;
 return {...deriveConnectionStatus({channel,configured:options.configured??!!profile,authorized:displayAuthorized,checking:isConnectionChecking(channel),readonlyVerified:current,stale:record?.stale,draftChanged:options.draftChanged,model,modelAvailable,fallbackUnverified:channel==='text'&&!independent&&client?.binding.kind==='core-user'&&(active?.capability.verification==='unknown'||!active?.capability.textModels.length),capabilityVerified:channel==='video'&&!!active&&active.client.binding.id===client?.binding.id&&active.capability.verification!=='unknown',enabled,failure:record?.failure,generationVerified}),profile:draft?undefined:profile,authorized:displayAuthorized,model,readonlyScope:displayRecord?.readonlyScope,verifiedAt:displayRecord?.verifiedAt,failure:displayRecord?.failure,generation:displayRecord?.generation??displayRecord?.generationHistory,mock:displayRecord?.mock,fallback:!draft&&channel==='text'&&!independent&&client?.binding.kind==='core-user'};
}
// Called only from successful, explicitly approved business flows, never checks or imports.
export function observeGeneration(client:CoreClient,channel:ConnectionChannel,model:string,spec?:string){
 const stamp=identity(client);return()=>{const active=channel==='text'?getIndependentText()??getActiveCore():getActiveCore(),record=records.get(recordId(channel,client.profile));if(!hasSessionCredential(client.binding.id)||identity(client)!==stamp||active?.client.binding.id!==client.binding.id||!record||record.stamp!==stamp||record.mock||!record.models.includes(model))return false;record.stale=false;record.failure=undefined;const at=Date.now(),scope=(channel==='text'?'文字模型 ':'视频模型 ')+model+(spec?' · '+spec:'');record.generation={stamp,model,spec,at,scope};record.generationHistory={at,scope};notify();void withDatabase(undefined,db=>transact(db,['diagnostics'],'readwrite',async tx=>{const id='connection-status:'+recordId(channel,client.profile),previous=await requestResult<Record<string,unknown>|undefined>(tx.objectStore('diagnostics').get(id));if(previous&&identity(client)===stamp&&hasSessionCredential(client.binding.id))tx.objectStore('diagnostics').put({...previous,generationHistory:{at,scope}});})).catch(()=>{});return true;};
}
export function resetConnectionStatus(){for(const channel of checks.keys())cancelConnectionCheck(channel);checks.clear();records.clear();selected.clear();candidates.clear();submittedVideos.clear();}
// Capture authorization before dispatch: an old response cannot change a new Key's state.
export function observeGenerationFailure(client:CoreClient,channel:ConnectionChannel){
 const stamp=identity(client);return(failure:{httpStatus?:number})=>{const active=channel==='text'?getIndependentText()??getActiveCore():getActiveCore(),record=records.get(recordId(channel,client.profile));if(!hasSessionCredential(client.binding.id)||identity(client)!==stamp||active?.client.binding.id!==client.binding.id||!record||record.stamp!==stamp||record.mock)return false;
  const categories:Record<number,string>={401:'authentication',403:'forbidden',402:'quota',404:'not_found',429:'rate_limited',500:'unavailable',502:'unavailable',503:'unavailable',504:'unavailable'};
  record.failure=safeConnectionFailure({httpStatus:failure.httpStatus,category:categories[failure.httpStatus??0]});record.stale=true;record.generation=undefined;notify();return true;
 };
}
