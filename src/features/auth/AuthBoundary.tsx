import {useEffect,useState,useSyncExternalStore,useRef} from 'react';
import {sessionStore,type AuthState} from '../../infrastructure/api/session';
import {ApiError,apiMessage} from '../../infrastructure/api/client';
import {createPageMemory} from './page-memory';
import {applyPreferencesToDocument,defaultPreferences,getPreferences} from '../settings/preferences-store';
import {LocalLink,navigate,useRoute} from '../../app/routes';
import {createWorkspaceClient,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {CloudGlobalSearch,CloudCommandPalette,CloudConnectionStatus,CloudNotifications} from './CloudShellChrome';
import {LoginPage} from './LoginPage';
import {RegisterPage} from './RegisterPage';
import {AccountPreferences} from './AccountPreferences';
import {CloudWorkspace} from '../workspace/CloudWorkspace';
import {navigation} from '../../app/navigation';
import '../workspace/original-workbench.css';
import {ApiSettingsPanel} from '../settings/ApiSettingsPanel';
import {ApiSettingsError} from '../settings/api-settings-client';
import type {ApiSettingsBridge} from '../settings/use-api-settings';
const accountApiBridge:ApiSettingsBridge={getIdentity(){const state=sessionStore.getState();return state.status==='authenticated'?{userId:state.session.user.id,contextId:state.session.contextId,csrfToken:state.session.csrfToken}:null;},subscribe:sessionStore.subscribe,refresh:sessionStore.refresh};
const KNOWN_PATHS=['/canvas','/projects/packages','/projects','/assets','/trash','/prompts','/prompt-generator','/prompt-generator/history','/tasks','/activity','/recovery','/help','/settings/connections','/settings/models','/settings/capabilities','/settings/migration','/settings/appearance'];
function launchTarget(lastVisitedPage:string){
 if(!lastVisitedPage||lastVisitedPage==='/welcome')return '/projects';
 if(KNOWN_PATHS.includes(lastVisitedPage)||/^\/projects\/[^/]+\/canvas$/.test(lastVisitedPage))return lastVisitedPage;
 return '/projects';
}
function AccountShell({state,path}:{state:Extract<AuthState,{status:'authenticated'}>;path:string}){
 const [error,setError]=useState(''),memory=useRef<ReturnType<typeof createPageMemory>|null>(null),[navOpen,setNavOpen]=useState(true),[client,setClient]=useState<WorkspaceClient>();
 useEffect(()=>{const created=createWorkspaceClient({getIdentity(){const current=sessionStore.getState();return current.status==='authenticated'?{userId:current.session.user.id,contextId:current.session.contextId,csrfToken:current.session.csrfToken}:null;},subscribe:sessionStore.subscribe,refresh:sessionStore.refresh});setClient(created);return()=>created.dispose();},[]);
 const projectId=/^\/projects\/([a-f0-9-]{36})(?:\/|$)/.exec(path)?.[1];
 useEffect(()=>{const controller=createPageMemory(sessionStore,state.session.contextId,failure=>setError(failure?apiMessage(failure):''));memory.current=controller;return()=>{controller.dispose();memory.current=null;};},[state.session.contextId]);
 useEffect(()=>{memory.current?.visit(path);},[path,state.session.contextId]);
 // 旧 /welcome 已并入 API 设置：直接跳转，不再渲染重复的使用引导。
 useEffect(()=>{if(path==='/welcome')navigate('/settings/connections');},[path]);
 const theme=state.document.preferences.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.document.preferences.theme;
 async function toggleTheme(){try{await sessionStore.saveDocument({expectedRevision:state.document.revision,preferences:{...state.document.preferences,theme:theme==='dark'?'light':'dark'}});}catch(failure){setError(apiMessage(failure));}}
 const canvasRoute=/^\/projects\/[^/]+\/(canvas|agent)$/.test(path);
 const activePath=(href:string)=>path===href.split('?')[0]||(href==='/canvas'&&canvasRoute)||(href.startsWith('/settings/')&&path.startsWith('/settings/'));
 return <div className={'app-shell account-shell'+(canvasRoute?' canvas-shell':'')+(navOpen?'':' nav-collapsed')}>
 <aside className="navigation"><LocalLink data-interaction-id="restore:authboundary:1" className="brand" href="/projects" aria-label="AI WORK Studio">AI WORK<span>Studio</span></LocalLink><nav className="account-nav" aria-label="主导航"><button data-interaction-id="account:nav:toggle" type="button" className="button nav-toggle" aria-expanded={navOpen} onClick={()=>setNavOpen(open=>!open)}>{navOpen?'收起导航':'展开导航'}</button>{navigation.map(item=><LocalLink data-interaction-id="restore:authboundary:2" className="nav-link" title={item.label} aria-label={item.label} key={item.path} href={item.path} aria-current={activePath(item.path)?'page':undefined}><span className="nav-symbol" aria-hidden="true">{item.symbol}</span><span className="nav-label">{item.label}</span></LocalLink>)}</nav><div className="navigation-footer"><div className="account-links"><LocalLink data-interaction-id="restore:authboundary:3" href="/trash">回收站</LocalLink><LocalLink data-interaction-id="restore:authboundary:4" href="/recovery">恢复中心</LocalLink><LocalLink data-interaction-id="restore:authboundary:5" href="/settings/appearance">账号偏好</LocalLink><LocalLink data-interaction-id="restore:authboundary:6" href="/settings/migration">旧版数据迁移</LocalLink><LocalLink data-interaction-id="restore:authboundary:7" href="/projects/packages">项目备份</LocalLink></div><p>账号云端工作区</p></div></aside>
 <div className="app-main"><header className="topbar account-header">{client?<><CloudGlobalSearch client={client}/><CloudCommandPalette projectId={projectId}/><CloudConnectionStatus client={client}/><CloudNotifications client={client}/></>:null}<button className="button" data-interaction-id="account:theme" disabled={state.busy} aria-label={theme==='dark'?'切换到浅色主题':'切换到深色主题'} onClick={()=>void toggleTheme()}>{theme==='dark'?'☀':'☾'}</button><LocalLink data-interaction-id="restore:authboundary:8" className="button" href="/help" aria-label="当前区域帮助">?</LocalLink><span className="account-user" title={'当前账号：'+state.session.user.username}>{state.session.user.username}</span><button data-interaction-id="account:logout" className="button" onClick={()=>{void sessionStore.logout().catch(()=>{});}}>退出登录</button></header><main className="page-content account-content">{error?<p role="alert" className="banner error">{error}</p>:null}{path==='/welcome'?<p role="status">正在前往 API 设置…</p>:['/settings/connections','/settings/models','/settings/capabilities'].includes(path)?<ApiSettingsPanel context="settings" readOnly={path==='/settings/models'||path==='/settings/capabilities'} bridge={accountApiBridge} enterBusy={state.busy} onEnter={async()=>{try{await sessionStore.completeOnboarding();navigate('/projects');}catch(error){throw new ApiSettingsError(error instanceof ApiError?error.status:0,error instanceof ApiError?error.code:'INTERNAL_ERROR');}}} onReloadOnboarding={async()=>{await sessionStore.reloadDocument();}}/>:path==='/settings/migration'?<CloudWorkspace path={path}/>:path==='/settings/appearance'?<AccountPreferences state={state}/>:['/canvas','/projects/packages','/projects','/assets','/trash','/prompts','/prompt-generator','/prompt-generator/history','/tasks','/activity','/recovery','/help'].includes(path)||(path.startsWith('/projects/')&&/^\/projects\/[^/]+\/(canvas|agent|results|compare)$/.test(path))?<CloudWorkspace path={path}/>:<section className="card"><h1>账号工作区</h1><p>该页面地址尚未开放。</p><p className="muted">可按上方导航继续操作；数据仅保存在当前账号。</p><p className="muted">当前成功能：账号偏好、项目和素材云端存储。</p><LocalLink data-interaction-id="account:workspace:preferences" href="/settings/appearance">查看账号偏好</LocalLink></section>}</main></div></div>;
}
export function AuthBoundary(){
 const state=useSyncExternalStore(sessionStore.subscribe,sessionStore.getState),route=useRoute(),path=route.split('?')[0];
 useEffect(()=>sessionStore.start(),[]);
 useEffect(()=>{const apply=()=>applyPreferencesToDocument(state.status==='authenticated'?getPreferences():defaultPreferences);apply();const color=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');color.addEventListener('change',apply);motion.addEventListener('change',apply);return()=>{color.removeEventListener('change',apply);motion.removeEventListener('change',apply);};},[state]);
 useEffect(()=>{if(state.status==='anonymous'&&path!=='/register'&&path!=='/login')navigate('/register');if(state.status==='authenticated'&&['/','/login','/register'].includes(path))navigate(state.document.onboardingCompletedAt?launchTarget(state.document.lastVisitedPage):'/projects');},[state,path]);
 useEffect(()=>{document.title=(path==='/register'?'注册':path==='/login'?'登录':path==='/settings/migration'?'旧版数据迁移':path==='/settings/appearance'?'账号偏好':path==='/activity'?'活动':path==='/recovery'?'恢复':path==='/help'?'帮助':'账号工作区')+' · AI WORK Studio';},[path]);
 if(state.status==='checking')return <main className="account-entry"><p role="status">正在确认登录状态…</p></main>;
 if(state.status==='error')return <main className="account-entry"><section className="card"><h1>暂时无法连接</h1><p role="alert">{state.message}</p><button data-interaction-id="account:session:reload" className="button" onClick={()=>{void sessionStore.refresh();}}>重新检查登录</button></section></main>;
 if(state.status==='anonymous')return <>{state.message?<p className="banner warning" role="alert">{state.message}</p>:null}{path==='/register'?<RegisterPage/>:<LoginPage/>}</>;
 return <AccountShell key={state.session.contextId} state={state} path={path}/>;
}
