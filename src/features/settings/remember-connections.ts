import {readCredential,saveCredential,removeSavedCredential} from '../../security/credential-vault';
import {withCredential,setSessionCredential,hasSessionCredential,credentialRevision,forgetSessionCredential} from '../../security/credential-session';
import {getActiveCore,setActiveCore,subscribeActiveCore} from '../../adapters/core/current-connection';
import {getIndependentText,setActiveText,subscribeTextConnection} from '../../adapters/text/current-text';
import {createCoreClient,createTextClient} from '../../adapters/core/http-client';
import {loadRegisteredConnections,matchRegisteredConnection} from '../../infrastructure/deployment/registration';
import {registerConnectionTarget} from '../../infrastructure/deployment/register-target';
import {runConnectionCheck,rememberReadonlyStatus,connectionStatusView,subscribeConnectionStatus,isConnectionChecking,observeGenerationFailure} from './connection-status';
import {withDatabase,transact} from '../../infrastructure/storage/database';
import {readonlyStatusMetadata} from './connection-status';
import {sanitizeKnownSecrets} from '../../security/credential-session';
import type {CoreClient} from '../../adapters/core/http-client';
import type {CapabilityProfile} from '../../domain/connection';
const active=(channel:'text'|'video')=>channel==='text'?getIndependentText():getActiveCore();
const savedStamps=new Map<string,string>();
const stamp=(channel:'text'|'video')=>{const item=active(channel);return item?JSON.stringify([item.client.profile,item.client.binding,item.capability,credentialRevision(item.client.binding.id)]):'';};
export async function rememberVerifiedConnection(channel:'text'|'video',client:CoreClient,capability:CapabilityProfile,assertCurrent:()=>void){
 const revision=credentialRevision(client.binding.id);await withCredential(client.binding.id,secret=>saveCredential(channel,{profile:client.profile,binding:client.binding,capability,secret},()=>{assertCurrent();return hasSessionCredential(client.binding.id)&&credentialRevision(client.binding.id)===revision;}));assertCurrent();
}
export async function rememberActiveConnections(){for(const channel of ['text','video'] as const){const item=active(channel),identity=stamp(channel);if(!item||!hasSessionCredential(item.client.binding.id)||connectionStatusView(channel).tone!=='success'||savedStamps.get(channel)===identity)continue;
 const saved=await withCredential(item.client.binding.id,secret=>saveCredential(channel,{profile:item.client.profile,binding:item.client.binding,capability:item.capability,secret},()=>stamp(channel)===identity&&hasSessionCredential(item.client.binding.id)));if(saved)savedStamps.set(channel,identity);
}}
export async function forgetRememberedConnection(channel:'text'|'video'){savedStamps.delete(channel);await removeSavedCredential(channel);}
export async function checkRememberedConnection(channel:'text'|'video'){
 const item=active(channel);if(!item||!hasSessionCredential(item.client.binding.id)||isConnectionChecking(channel))return;
 await runConnectionCheck(channel,item.client,async ctx=>{const reply=await item.client.testConnection({signal:ctx.signal});ctx.assertCurrent();if(!reply.ok)throw reply.error;const models=reply.value.map(m=>m.id);if(models.some(m=>sanitizeKnownSecrets(m)!==m))throw Error('model_catalog_unsafe');const registry=await loadRegisteredConnections();ctx.assertCurrent();const entry=matchRegisteredConnection(item.client.profile,registry);if(!entry)throw Error('connection_unregistered');const mock=entry.contract.evidence.some(e=>e.kind==='mock'),verifiedAt=Date.now();rememberReadonlyStatus(channel,item.client,models,{mock,verifiedAt});await withDatabase(undefined,db=>transact(db,['diagnostics'],'readwrite',tx=>{ctx.assertCurrent();tx.objectStore('diagnostics').put(readonlyStatusMetadata(channel,item.client,verifiedAt,models,mock));}));});
}
export async function restoreRememberedConnections(){let registry=await loadRegisteredConnections();for(const channel of ['text','video'] as const){
 if(active(channel))continue;const stored=await readCredential(channel);if(!stored)continue;
 if(channel==='text'&&!matchRegisteredConnection(stored.profile,registry)){const registered=await registerConnectionTarget('text',stored.profile.name,stored.profile.originSnapshot);if(registered.id!==stored.profile.id||registered.proxyBase!==stored.profile.proxyBase||registered.originSnapshot!==stored.profile.originSnapshot||registered.contractVersion!==stored.profile.contractVersion)throw Error('credential_registration_changed');registry=await loadRegisteredConnections(true);}
 const entry=matchRegisteredConnection(stored.profile,registry);if(!entry)continue;
 setSessionCredential(stored.binding.id,stored.secret);
 try{const client=(channel==='text'?createTextClient:createCoreClient)(stored.profile,{binding:stored.binding,withCredential},{registry:[{...entry.profile,id:stored.profile.id,name:stored.profile.name}]});if(channel==='text')setActiveText(client,stored.capability);else setActiveCore(client,stored.capability);savedStamps.set(channel,stamp(channel));}catch{forgetSessionCredential(stored.binding.id);continue;}
 await checkRememberedConnection(channel).catch(()=>{});
}}
export function startRememberedConnections(onError:(message:string)=>void){
 let stopped=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined;
 const persist=()=>{if(stopped)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(busy||stopped)return;busy=true;void rememberActiveConnections().then(()=>onError('')).catch(()=>onError('API 凭据未能在本机保存；当前连接可继续使用，刷新后可能需要重填。')).finally(()=>{busy=false;});},100);};
 const a=subscribeActiveCore(persist),b=subscribeTextConnection(persist),c=subscribeConnectionStatus(persist);
 void restoreRememberedConnections().then(persist).catch(()=>onError('本机 API 凭据恢复失败，请在设置中重新连接。'));
 const health=setInterval(()=>{for(const channel of ['text','video'] as const)void checkRememberedConnection(channel).catch(()=>{});},30000);
 const wake=()=>{if(document.visibilityState==='visible')for(const channel of ['text','video'] as const)void checkRememberedConnection(channel).catch(()=>{});},offline=()=>{for(const channel of ['text','video'] as const){const item=active(channel);if(item)observeGenerationFailure(item.client,channel)({httpStatus:0});}};document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);window.addEventListener('offline',offline);
 return()=>{stopped=true;if(timer)clearTimeout(timer);clearInterval(health);a();b();c();document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);window.removeEventListener('offline',offline);};
}
