import {useEffect,useState,useSyncExternalStore,useRef} from 'react';
import {sessionStore,type AuthState} from '../../infrastructure/api/session';
import {ApiError,apiMessage} from '../../infrastructure/api/client';
import {createPageMemory} from './page-memory';
import {applyPreferencesToDocument,defaultPreferences,getPreferences} from '../settings/preferences-store';
import {LocalLink,navigate,useRoute} from '../../app/routes';
import {LoginPage} from './LoginPage';
import {RegisterPage} from './RegisterPage';
import {AccountPreferences} from './AccountPreferences';
import {CloudWorkspace} from '../workspace/CloudWorkspace';
import {ApiSettingsPanel} from '../settings/ApiSettingsPanel';
import {ApiSettingsError} from '../settings/api-settings-client';
import type {ApiSettingsBridge} from '../settings/use-api-settings';
const accountApiBridge:ApiSettingsBridge={getIdentity(){const state=sessionStore.getState();return state.status==='authenticated'?{userId:state.session.user.id,contextId:state.session.contextId,csrfToken:state.session.csrfToken}:null;},subscribe:sessionStore.subscribe,refresh:sessionStore.refresh};
const KNOWN_PATHS=['/projects','/assets','/trash','/prompts','/prompt-generator','/prompt-generator/history','/tasks','/settings/connections','/settings/models','/settings/capabilities','/settings/migration','/settings/appearance'];
function launchTarget(lastVisitedPage:string){
 if(!lastVisitedPage||lastVisitedPage==='/welcome')return '/projects';
 if(KNOWN_PATHS.includes(lastVisitedPage)||/^\/projects\/[^/]+\/canvas$/.test(lastVisitedPage))return lastVisitedPage;
 return '/projects';
}
function AccountShell({state,path}:{state:Extract<AuthState,{status:'authenticated'}>;path:string}){
 const [error,setError]=useState(''),memory=useRef<ReturnType<typeof createPageMemory>|null>(null),[navOpen,setNavOpen]=useState(true);
 useEffect(()=>{const controller=createPageMemory(sessionStore,state.session.contextId,failure=>setError(failure?apiMessage(failure):''));memory.current=controller;return()=>{controller.dispose();memory.current=null;};},[state.session.contextId]);
 useEffect(()=>{memory.current?.visit(path);},[path,state.session.contextId]);
 // 旧 /welcome 已并入 API 设置：直接跳转，不再渲染重复的使用引导。
 useEffect(()=>{if(path==='/welcome')navigate('/settings/connections');},[path]);
 return <div className={'account-shell'+(navOpen?'':' nav-collapsed')}><header className="account-header"><span className="account-brand">AI WORK Studio</span><p>当前账号：{state.session.user.username}</p><button data-interaction-id="account:logout" className="button" onClick={()=>{void sessionStore.logout().catch(()=>{});}}>退出登录</button></header><nav className="account-nav" aria-label="账号导航"><button data-interaction-id="account:nav:toggle" type="button" className="button" aria-expanded={navOpen} onClick={()=>setNavOpen(open=>!open)}>{navOpen?'收起导航':'展开导航'}</button><LocalLink data-interaction-id="account:nav:projects" href="/projects">项目</LocalLink><LocalLink data-interaction-id="account:nav:assets" href="/assets">素材库</LocalLink><LocalLink data-interaction-id="account:nav:prompts" href="/prompts">提示词库</LocalLink><LocalLink data-interaction-id="account:nav:prompt-generator" href="/prompt-generator">提示词写作</LocalLink><LocalLink data-interaction-id="account:nav:tasks" href="/tasks">任务中心</LocalLink><LocalLink data-interaction-id="account:nav:trash" href="/trash">回收站</LocalLink><LocalLink data-interaction-id="account:nav:appearance" href="/settings/appearance">账号偏好</LocalLink><LocalLink data-interaction-id="account:nav:api" href="/settings/connections">API 设置</LocalLink><LocalLink data-interaction-id="account:nav:migration" href="/settings/migration">旧版数据迁移</LocalLink></nav><main className="account-content">{error?<p role="alert" className="banner error">{error}</p>:null}{path==='/welcome'?<p role="status">正在前往 API 设置…</p>:['/settings/connections','/settings/models','/settings/capabilities'].includes(path)?<ApiSettingsPanel context="settings" readOnly={path==='/settings/models'||path==='/settings/capabilities'} bridge={accountApiBridge} enterBusy={state.busy} onEnter={async()=>{try{await sessionStore.completeOnboarding();navigate('/projects');}catch(error){throw new ApiSettingsError(error instanceof ApiError?error.status:0,error instanceof ApiError?error.code:'INTERNAL_ERROR');}}} onReloadOnboarding={async()=>{await sessionStore.reloadDocument();}}/>:path==='/settings/migration'?<CloudWorkspace path={path}/>:path==='/settings/appearance'?<AccountPreferences state={state}/>:['/projects','/assets','/trash','/prompts','/prompt-generator','/prompt-generator/history','/tasks'].includes(path)||(path.startsWith('/projects/')&&path.endsWith('/canvas'))?<CloudWorkspace path={path}/>:<section className="card"><h1>账号工作区</h1><p>该页面地址尚未开放。</p><p className="muted">可按上方导航继续操作；数据仅保存在当前账号。</p><p className="muted">当前成功能：账号偏好、项目和素材云端存储。</p><LocalLink data-interaction-id="account:workspace:preferences" href="/settings/appearance">查看账号偏好</LocalLink></section>}</main></div>;
}
export function AuthBoundary(){
 const state=useSyncExternalStore(sessionStore.subscribe,sessionStore.getState),route=useRoute(),path=route.split('?')[0];
 useEffect(()=>sessionStore.start(),[]);
 useEffect(()=>{const apply=()=>applyPreferencesToDocument(state.status==='authenticated'?getPreferences():defaultPreferences);apply();const color=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');color.addEventListener('change',apply);motion.addEventListener('change',apply);return()=>{color.removeEventListener('change',apply);motion.removeEventListener('change',apply);};},[state]);
 useEffect(()=>{if(state.status==='anonymous'&&path!=='/register'&&path!=='/login')navigate('/register');if(state.status==='authenticated'&&['/','/login','/register'].includes(path))navigate(state.document.onboardingCompletedAt?launchTarget(state.document.lastVisitedPage):'/projects');},[state,path]);
 useEffect(()=>{document.title=(path==='/register'?'注册':path==='/login'?'登录':path==='/settings/migration'?'旧版数据迁移':path==='/settings/appearance'?'账号偏好':'账号工作区')+' · AI WORK Studio';},[path]);
 if(state.status==='checking')return <main className="account-entry"><p role="status">正在确认登录状态…</p></main>;
 if(state.status==='error')return <main className="account-entry"><section className="card"><h1>暂时无法连接</h1><p role="alert">{state.message}</p><button data-interaction-id="account:session:reload" className="button" onClick={()=>{void sessionStore.refresh();}}>重新检查登录</button></section></main>;
 if(state.status==='anonymous')return <>{state.message?<p className="banner warning" role="alert">{state.message}</p>:null}{path==='/register'?<RegisterPage/>:<LoginPage/>}</>;
 return <AccountShell key={state.session.contextId} state={state} path={path}/>;
}
