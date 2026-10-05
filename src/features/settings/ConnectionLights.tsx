import {useEffect,useState} from 'react';
import {connectionStatusView,subscribeConnectionStatus} from './connection-status';
import {subscribeActiveCore} from '../../adapters/core/current-connection';
export function ConnectionLights(){
 const [,refresh]=useState(0);useEffect(()=>{const update=()=>refresh(n=>n+1),a=subscribeConnectionStatus(update),b=subscribeActiveCore(update);return()=>{a();b();};},[]);
 return <section aria-label="侧栏 API 连接状态" className="sidebar-api-lights">{(['text','video'] as const).map(channel=>{const view=connectionStatusView(channel),label=channel==='text'?'文字 API':'视频 API',state=view.tone==='success'?'success':view.tone==='failed'||view.code==='unauthorized'?'failed':view.code==='checking'?'checking':'pending';return <div key={channel} aria-label={label+' 连接指示'} data-state={state} title={label+'：'+view.label} aria-live="polite"><span className={'connection-dot '+state} aria-hidden="true"/><span>{label}</span><span className="sr-only">{view.label}</span></div>;})}</section>;
}
