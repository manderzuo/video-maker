import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {LocalLink} from '../../app/routes';
import {createApiSettingsClient,apiSettingsMessage,ApiSettingsError,type ApiSettingsClient} from './api-settings-client';
import {createApiSettingsStore,type ApiSettingsBridge} from './use-api-settings';
import {ApiModelFields} from './ApiModelFields';
import './api-settings.css';
const defaultClient=createApiSettingsClient();
export function ApiSettingsPanel({context,bridge,client=defaultClient,onEnter,onReloadOnboarding,enterBusy=false,readOnly=false}:{context:'welcome'|'settings';bridge:ApiSettingsBridge;client?:ApiSettingsClient;onEnter?:()=>Promise<void>;onReloadOnboarding?:()=>Promise<void>;enterBusy?:boolean;readOnly?:boolean}){
 const store=useMemo(()=>createApiSettingsStore(bridge,client),[bridge,client]),state=useSyncExternalStore(store.subscribe,store.getState),[enterPending,setEnterPending]=useState(false),[enterError,setEnterError]=useState(''),[enterConflict,setEnterConflict]=useState(false),[reloadPending,setReloadPending]=useState(false),[enterMessage,setEnterMessage]=useState('');
 useEffect(()=>{store.start();return()=>store.dispose();},[store]);
 async function enter(){if(!onEnter||enterPending||enterBusy||enterConflict)return;setEnterPending(true);setEnterError('');setEnterMessage('');try{await onEnter();}catch(error){const conflict=error instanceof ApiSettingsError&&error.code==='REVISION_CONFLICT';setEnterConflict(conflict);setEnterError(conflict?'首次配置状态已在其他页面更新，请重新加载账号状态再进入工作台。':apiSettingsMessage(error));}finally{setEnterPending(false);}}
 async function reloadOnboarding(){if(!onReloadOnboarding||reloadPending||enterBusy)return;setReloadPending(true);try{await onReloadOnboarding();setEnterConflict(false);setEnterError('');setEnterMessage('账号状态已重新加载，请再次进入工作台。');}catch{setEnterError('账号状态加载失败，API 输入已保留，请重新加载账号状态。');}finally{setReloadPending(false);}}
 const pending=state.text.pending!==null||state.video.pending!==null;
 return <section className="api-settings-panel" aria-label={readOnly?'当前模型':context==='welcome'?'首次 API 配置':'API 设置'}>
  <header className="api-settings-heading"><h1>{readOnly?'当前模型':context==='welcome'?'欢迎使用 AI WORK Studio':'API 设置'}</h1><p className="muted">{readOnly?'模型来自当前账号已保存的 API 配置。':context==='welcome'?'连接你的服务，开始创作。也可以先进入工作台，稍后再配置。':'配置保存到当前账号，可在 Welcome 和设置页查看。'}</p></header>
  {state.status==='loading'?<p role="status" className="muted">正在加载当前账号配置…</p>:null}
  {state.error?<p role="alert" className="banner error">{state.error}</p>:null}
  {readOnly?<div className="api-model-summary">{(['video','text'] as const).map(channel=><section className="card" key={channel}><h2>{channel==='video'?'视频模型':'文字模型'}</h2><p>{state[channel].saved?.model??'尚未配置'}</p><p className="muted">{state[channel].saved?.apiBase??'请前往 API 设置填写连接信息。'}</p></section>)}<LocalLink data-interaction-id="task3:models:settings" href="/settings/connections">前往 API 设置</LocalLink></div>:<>
   <div className="api-settings-grid"><ApiModelFields channel="video" draft={state.video} store={store} ready={state.status==='ready'}/><ApiModelFields channel="text" draft={state.text} store={store} ready={state.status==='ready'}/></div>
   <p className="api-settings-note muted">测试连接仅检查连接和模型目录；测试不会保存配置或发起生成。保存无需先测试。</p>
   {state.error||state.text.conflict||state.video.conflict?<div className="api-reload"><p className="muted">重新加载会用服务器保存值替换两项未保存的输入。</p><button data-interaction-id="task3:reload" type="button" className="button" disabled={pending||state.status==='loading'} onClick={()=>{void store.reload();}}>重新加载两项配置</button></div>:null}
   {context==='welcome'?<div className="api-enter"><button data-interaction-id="task3:enter" type="button" className="button primary" disabled={enterPending||enterBusy||pending||enterConflict||reloadPending} onClick={()=>{void enter();}}>{enterPending?'正在进入…':'进入工作台'}</button>{enterConflict&&onReloadOnboarding?<button data-interaction-id="task3:onboarding:reload" type="button" className="button" disabled={reloadPending||enterBusy} onClick={()=>{void reloadOnboarding();}}>{reloadPending?'正在加载…':'重新加载账号状态'}</button>:null}{enterMessage?<p role="status" className="api-feedback">{enterMessage}</p>:null}{enterError?<p role="alert" className="api-feedback error">{enterError}</p>:null}</div>:<LocalLink data-interaction-id="task3:settings:models" href="/settings/models">查看当前模型</LocalLink>}
  </>}
 </section>;
}
