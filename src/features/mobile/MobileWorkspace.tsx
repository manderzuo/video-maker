import './mobile.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthForm } from '../auth/AuthForm';
import { AccountPreferences } from '../auth/AccountPreferences';
import { sessionStore, type AuthState } from '../../infrastructure/api/session';
import type { WorkspaceClient } from '../../infrastructure/api/workspace-client';
import { createMobileWorkspaceClient } from './mobile-workspace-client';
import { LocalLink, navigate } from '../../app/routes';
import { WorkspacePresentation } from '../workspace/workspace-navigation';
import { CloudProjectsPage } from '../workspace/CloudProjectsPage';
import { CloudAssetsPage } from '../workspace/CloudAssetsPage';
import { CloudTasksPage } from '../workspace/CloudTasksPage';
import { CloudPromptGeneratorPage } from '../workspace/CloudPromptGeneratorPage';
import { CloudResultsPage } from '../workspace/CloudResultsPage';
import { CloudComparePage } from '../workspace/CloudComparePage';
import { ApiSettingsPanel } from '../settings/ApiSettingsPanel';
import { MobileShell } from './MobileShell';
import { MobileVideoPage } from './MobileVideoPage';
import { MobileCanvasPage } from './MobileCanvasPage';
import { useMobileViewport } from './use-mobile-viewport';
import { toMobilePath, toDesktopPath, mobileReturnPath } from './mobile-routes';
const bridge = { getIdentity() { const state = sessionStore.getState(); return state.status === 'authenticated' ? { userId: state.session.user.id, contextId: state.session.contextId, csrfToken: state.session.csrfToken } : null; }, subscribe: sessionStore.subscribe, refresh: sessionStore.refresh };
export function MobileWorkspace({ state, path }: {
    state: AuthState;
    path: string;
}) {
    const held = useRef<Extract<AuthState, { status: 'authenticated' }> | undefined>(undefined), recovering = useRef(false);
    if (state.status === 'authenticated') { held.current = state; recovering.current = false; }
    else if (state.status === 'anonymous' || state.status === 'checking' && !recovering.current) held.current = undefined;
    const effective = held.current && (state.status === 'error' || state.status === 'checking' && recovering.current) ? held.current : state;
    return <MobileWorkspaceContent key={effective.status === 'authenticated' ? effective.session.contextId : 'anonymous'} state={effective} path={path} suspended={effective !== state} sessionMessage={state.status === 'error' ? state.message : state.status === 'checking' ? '正在重新确认登录状态…' : undefined} onRetry={() => { recovering.current = true; void sessionStore.refresh(); }}/>;
}
function MobileWorkspaceContent({ state, path, suspended, sessionMessage, onRetry }: { state: AuthState; path: string; suspended: boolean; sessionMessage?: string; onRetry: () => void }) {
    const [client, setClient] = useState<WorkspaceClient>();
    const viewport = useMobileViewport(), contextId = state.status === 'authenticated' ? state.session.contextId : undefined;
    const navigation = useMemo(() => ({ href: (target: string) => { const mapped = toMobilePath(target), returnTo = new URLSearchParams(location.search).get('returnTo'); return returnTo && ['/m/login', '/m/register'].includes(mapped) ? mapped + '?returnTo=' + encodeURIComponent(mobileReturnPath(returnTo)) : mapped; }, go: (target: string) => navigate(toMobilePath(!target.startsWith('/m/') && /\/projects\/[a-f0-9-]{36}\/canvas\?node=/.test(target) ? target.replace('/canvas?', '/video?') : target)) }), []);
    useEffect(() => { if (!contextId)
        return; const created = createMobileWorkspaceClient(bridge); setClient(created); return () => { created.dispose(); setClient(undefined); }; }, [contextId]);
    const project = /^\/m\/projects\/([a-f0-9-]{36})\/(canvas|video|results|compare)$/.exec(path);
    const contents = state.status === 'anonymous' ? <>{state.message ? <p role="alert" className="banner error">{state.message}</p> : null}<AuthForm operation={path === '/m/register' ? 'register' : 'login'}/></> : state.status !== 'authenticated' ? <p role="status">正在确认账号…</p> : !client ? <p role="status">正在打开手机工作区…</p> : path === '/m/projects' ? <CloudProjectsPage client={client}/> : path === '/m/assets' ? <CloudAssetsPage client={client}/> : path === '/m/tasks' ? <CloudTasksPage client={client}/> : path === '/m/prompt-generator' ? <CloudPromptGeneratorPage client={client}/> : project?.[2] === 'video' ? <MobileVideoPage key={project[1]} client={client} projectId={project[1]} nodeId={new URLSearchParams(location.search).get('node') ?? undefined}/> : project?.[2] === 'canvas' ? <MobileCanvasPage key={project[1]} client={client} projectId={project[1]}/> : project?.[2] === 'results' ? <CloudResultsPage client={client} projectId={project[1]}/> : project?.[2] === 'compare' ? <CloudComparePage client={client} projectId={project[1]}/> : path === '/m/settings/connections' ? <ApiSettingsPanel context="settings" bridge={bridge} enterBusy={state.busy} onEnter={async () => { await sessionStore.completeOnboarding(); navigate('/m/projects'); }} onReloadOnboarding={async () => { await sessionStore.reloadDocument(); }}/> : path === '/m/me' ? <section className="card"><h1>我的账号</h1><p>{state.session.user.username}</p><div className="actions"><LocalLink className="button" href="/m/settings/connections">API 设置</LocalLink><LocalLink className="button" href={toDesktopPath('/m/projects') + '?view=desktop'}>返回桌面版</LocalLink><button className="button" onClick={() => void sessionStore.logout().catch(() => { })}>退出登录</button></div><AccountPreferences state={state}/></section> : <section className="card"><h1>{project ? '手机项目' : '页面未找到'}</h1><p>{project ? '项目页面正在准备。' : '请通过手机导航选择页面。'}</p><LocalLink href="/m/projects">返回项目</LocalLink></section>;
    return <WorkspacePresentation.Provider value={{ presentation: 'mobile', navigation, viewport, suspended }}><MobileShell username={!suspended && state.status === 'authenticated' ? state.session.user.username : undefined} height={viewport.height} bottomInset={Math.max(0, window.innerHeight - viewport.height - viewport.top)}>{sessionMessage ? <section className="card"><p role="alert">{sessionMessage}</p>{suspended ? <p>本页输入已保留，确认同一账号后可继续。</p> : null}<button className="button" onClick={onRetry}>重新检查登录</button></section> : null}<div hidden={suspended}>{contents}</div></MobileShell></WorkspacePresentation.Provider>;
}
