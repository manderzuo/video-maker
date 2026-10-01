import {useRef,useState} from 'react';
import {Dialog} from '../../ui/Dialog';import {Button} from '../../ui/Button';
import type {Run} from '../../domain/run';
import {connectionSchema} from '../../domain/connection';
import {createAuthBinding} from '../../domain/authorization';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
import {loadRegisteredConnections,matchRegisteredConnection} from '../../infrastructure/deployment/registration';
import {createCoreClient} from '../../adapters/core/http-client';
import {resolveCapabilities} from '../../adapters/core/capabilities';
import {setActiveCore} from '../../adapters/core/current-connection';
import {setSessionCredential,forgetSessionCredential,withCredential,sanitizeKnownSecrets} from '../../security/credential-session';
export function ReauthorizeDialog({run,onClose,onAuthorized}:{run:Run;onClose:()=>void;onAuthorized:()=>void}){
 const key=useRef<HTMLInputElement>(null),[ack,setAck]=useState(false),[entered,setEntered]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function authorize(){
  if(!ack||!key.current?.value||!run.taskId)return;setBusy(true);setError('');let temporary:string|undefined;
  try{
   const registry=await loadRegisteredConnections(),stored=await withDatabase(undefined,db=>transact(db,['connections','receipts'],'readonly',async tx=>await requestResult(tx.objectStore('connections').get(run.connectionId))??(await requestResult<{profile?:unknown}|undefined>(tx.objectStore('receipts').get('hidden-connection:'+run.connectionId)))?.profile));
   const parsed=connectionSchema.safeParse(stored),candidates=registry.filter(r=>r.profile.originSnapshot===run.originSnapshot);
   const profile=parsed.success?parsed.data:candidates.length===1?{...candidates[0].profile,id:run.connectionId}:undefined;
   if(!profile||profile.id!==run.connectionId||profile.originSnapshot!==run.originSnapshot)throw Error('original_profile_unavailable');
   const registered=matchRegisteredConnection(profile,registry);if(!registered||!registered.contract.routes.videoQuery)throw Error('original_deployment_unregistered');
   const secret=key.current.value,probeBinding=createAuthBinding(profile);temporary=probeBinding.id;setSessionCredential(temporary,secret);
   const probe=createCoreClient(profile,{binding:probeBinding,withCredential},{registry:[profile]}),observed=await probe.queryVideo(run.taskId);
   if(!observed.ok)throw Error('original_resource_read_denied');
   const catalog=await probe.testConnection();if(!catalog.ok)throw Error('original_catalog_unverified');if(catalog.value.some(model=>sanitizeKnownSecrets(model.id)!==model.id))throw Error('model_catalog_unsafe');
   const binding={...probeBinding,id:run.authBindingId};setSessionCredential(binding.id,secret);
   const client=createCoreClient(profile,{binding,withCredential},{registry:[profile]});setActiveCore(client,resolveCapabilities(registered.contract,catalog.value));
   key.current.value='';onAuthorized();
  }catch{setError('原任务只读验证失败：请检查原 Key、固定部署登记及读取权限。原记录与归属保持不变，没有重新提交。');}
  finally{if(temporary)forgetSessionCredential(temporary);setBusy(false);}
 }
 return <Dialog open width={520} title="重新授权原任务" dismissible={!busy} onClose={()=>{if(key.current)key.current.value='';onClose();}} footer={<><Button data-interaction-id="ui:ReauthorizeDialog:Button:59bcccc6200b" disabled={busy} onClick={onClose}>返回保留记录</Button><Button data-interaction-id="J-11" disabled={!ack||!entered||!run.taskId} busy={busy} onClick={authorize}>只读验证原任务</Button></>}><p>原服务 {run.originSnapshot} · 原授权绑定 {run.authBindingId} · 原任务 {run.taskId??'未提供，不能编造查询身份'}</p><p>仅请求所列原任务及健康/模型目录，不创建任务，不改变原服务、幂等键或账务。凭据只保存在当前标签页内存。</p><label>原任务普通 Key<input data-interaction-id="ui:ReauthorizeDialog:input:4f9132f1b772" ref={key} type="password" autoComplete="off" disabled={busy} onChange={e=>setEntered(!!e.target.value.trim())}/></label><label className="generation-ack"><input data-interaction-id="ui:ReauthorizeDialog:input:a1dfff373358" type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>我确认此授权用于所列原任务，不改变其服务或归属</label>{error?<p role="alert">{error}</p>:null}</Dialog>;
}
