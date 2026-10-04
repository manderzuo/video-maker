import {useEffect,useState,lazy,Suspense,type ReactElement} from 'react';
import {navigation} from './navigation';
import {LocalLink,navigate,routeTitle,useRoute} from './routes';
import {Button} from '../ui/Button';
import {Dialog} from '../ui/Dialog';
import {copy,isEditableTarget,browserTimeZone} from '../ui/copy.zh-CN';
import {withDatabase,transact,requestResult} from '../infrastructure/storage/database';
import {projectSchema} from '../domain/project';
import {graphSchema} from '../domain/graph';
import {ConnectionSettings} from '../features/settings/ConnectionSettings';
import {usePreferences,useSystemDark,savePreferences,applyPreferencesToDocument} from '../features/settings/preferences-store';
import {ConnectionStatus} from '../features/settings/ConnectionStatus';
import {hydrateConnectionStatuses,videoStatusSpec} from '../features/settings/connection-status';
import {getActiveCore,subscribeActiveCore} from '../adapters/core/current-connection';
import '../ui/tokens.css';
const CanvasEntryPage=lazy(()=>import('../features/canvas/CanvasEntryPage').then(module=>({default:module.CanvasEntryPage})));
const ProjectsPage=lazy(()=>import('../features/projects/ProjectsPage').then(module=>({default:module.ProjectsPage})));
const TrashPage=lazy(()=>import('../features/projects/TrashPage').then(module=>({default:module.TrashPage})));
const PromptsPage=lazy(()=>import('../features/prompts/PromptsPage').then(module=>({default:module.PromptsPage})));
const AssetsPage=lazy(()=>import('../features/assets/AssetsPage').then(module=>({default:module.AssetsPage})));
const CanvasPage=lazy(()=>import('../features/canvas/CanvasPage').then(module=>({default:module.CanvasPage})));
const PromptGeneratorPage=lazy(()=>import('../features/prompt-generation/PromptGeneratorPage').then(module=>({default:module.PromptGeneratorPage})));
const TasksPage=lazy(()=>import('../features/tasks/TasksPage').then(module=>({default:module.TasksPage})));
const ResultPage=lazy(()=>import('../features/review/ResultPage').then(module=>({default:module.ResultPage})));
const ComparePage=lazy(()=>import('../features/review/ComparePage').then(module=>({default:module.ComparePage})));
const PackagePage=lazy(()=>import('../features/packages/PackagePage').then(module=>({default:module.PackagePage})));
const ActivityPage=lazy(()=>import('../features/activity/ActivityPage').then(module=>({default:module.ActivityPage})));
const HelpPage=lazy(()=>import('../features/help/HelpPage').then(module=>({default:module.HelpPage})));
const RecoveryCenter=lazy(()=>import('../features/recovery/RecoveryCenter').then(module=>({default:module.RecoveryCenter})));
const SettingsPage=lazy(()=>import('../features/settings/SettingsPage').then(module=>({default:module.SettingsPage})));

type SearchItem={title:string;path:string;kind:string};
function Welcome(){
 function continueLocal(create=false){try{localStorage.setItem('aiwork-studio:onboarding','1');}catch{/* Local navigation remains available. */}navigate(create?'/projects?create=1':'/projects');}
 return <section className="card welcome"><h1>开始你的创作项目</h1><p className="muted">画布保存在当前浏览器，生成任务由 AI Work Core 处理。</p><div className="welcome-grid"><ol className="welcome-steps"><li>1 · 连接服务</li><li>2 · 测试权限</li><li>3 · 创建项目</li></ol><div className="form-stack"><ConnectionSettings onboarding/><div className="actions"><Button variant="primary" data-interaction-id="W-01" onClick={()=>continueLocal()}>进入本地模式</Button><Button data-interaction-id="W-06" onClick={()=>continueLocal(true)}>继续创建项目</Button><LocalLink data-interaction-id="ui:App:LocalLink:61b40970ff46" href="/settings/connections">配置连接</LocalLink></div></div></div></section>;
}

function LocalHelp(){return <section className="card"><h2>本地创作与保存</h2><p>项目保存在当前浏览器。清除站点数据前，请导出项目备份。</p><p>整理素材、编辑画布和提示词不会调用模型。生成视频和文字优化分别确认。</p><p>提交结果暂未确认时，保留原任务并查询；停止查询不等于取消或退款。</p><LocalLink data-interaction-id="ui:App:LocalLink:afd303a98a52" href="/welcome">重新查看使用引导</LocalLink></section>;}
export function App():ReactElement{
 const route=useRoute(),pathname=route.split('?')[0],title=routeTitle(pathname);
 const preferences=usePreferences(),systemDark=useSystemDark(),activeCore=getActiveCore(),theme=preferences.theme==='system'?(systemDark?'dark':'light'):preferences.theme;const setTheme=(theme:'dark'|'light')=>{savePreferences({theme});};
 useEffect(()=>{void hydrateConnectionStatuses().catch(()=>{});},[]);
 const [,refreshConnection]=useState(0);useEffect(()=>subscribeActiveCore(()=>refreshConnection(v=>v+1)),[]);
 const [commandOpen,setCommandOpen]=useState(false),[shortcutOpen,setShortcutOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[connectionOpen,setConnectionOpen]=useState(false),[notificationOpen,setNotificationOpen]=useState(false);
 const [navigationMessage,setNavigationMessage]=useState('');
 const [commandQuery,setCommandQuery]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState<SearchItem[]>([]),[searchState,setSearchState]=useState<'idle'|'loading'|'ready'|'failed'>('idle');
 useEffect(()=>{const apply=()=>applyPreferencesToDocument(preferences),color=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');apply();color.addEventListener('change',apply);motion.addEventListener('change',apply);return()=>{color.removeEventListener('change',apply);motion.removeEventListener('change',apply);};},[preferences]);
 useEffect(()=>{document.title=(title?title+' · ':'')+'AI WORK Studio';},[title]);
 useEffect(()=>{if(pathname==='/'){let onboarded=false;try{onboarded=localStorage.getItem('aiwork-studio:onboarding')==='1';}catch{/* Welcome remains accessible. */}navigate(onboarded?preferences.lastVisitedPage:'/welcome');return;}if(['/projects','/canvas','/assets','/prompts','/prompt-generator','/tasks','/activity','/settings/connections','/settings/models','/settings/appearance','/settings/storage','/help','/trash','/recovery'].includes(pathname)&&preferences.lastVisitedPage!==pathname){const result=savePreferences({lastVisitedPage:pathname as typeof preferences.lastVisitedPage});setNavigationMessage(result.persisted?'':'本页已打开，导航偏好未能保存；重新打开后可能回到之前的页面。');}},[pathname,preferences.lastVisitedPage]);
 useEffect(()=>{
  const keydown=(event:KeyboardEvent)=>{if(event.isComposing||isEditableTarget(event.target)||document.querySelector('dialog[open]'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setCommandOpen(true);}};
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[]);
 useEffect(()=>{
  let active=true;
  if(!query.trim()){setSearchState('idle');setResults([]);return;}
  setSearchState('loading');
  const timer=setTimeout(async()=>{
   try{
    const found=await withDatabase(undefined,db=>transact(db,['projects','graphs','prompts'],'readonly',async tx=>{
     const projects=await requestResult<unknown[]>(tx.objectStore('projects').getAll()),graphs=await requestResult<unknown[]>(tx.objectStore('graphs').getAll()),prompts=await requestResult<unknown[]>(tx.objectStore('prompts').getAll());
     const rows:SearchItem[]=[],availableProjects=new Set<string>();
     for(const item of projects){const parsed=projectSchema.safeParse(item);if(parsed.success&&parsed.data.trashedAt===null){availableProjects.add(parsed.data.id);rows.push({title:parsed.data.title,path:'/projects/'+encodeURIComponent(parsed.data.id)+'/canvas',kind:'项目'});}}
     for(const item of graphs){const parsed=graphSchema.safeParse(item);if(parsed.success&&availableProjects.has(parsed.data.projectId))for(const node of parsed.data.nodes)rows.push({title:node.title,path:'/projects/'+encodeURIComponent(parsed.data.projectId)+'/canvas?node='+encodeURIComponent(node.id),kind:'节点'});}
     for(const item of prompts)if(item&&typeof item==='object'&&'id'in item&&'title'in item&&typeof item.id==='string'&&typeof item.title==='string')rows.push({title:item.title,path:'/prompts?entry='+encodeURIComponent(item.id),kind:'提示词'});
     return rows.filter(row=>row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,20);
    }));
    if(active){setResults(found);setSearchState('ready');}
   }catch{if(active)setSearchState('failed');}
  },300);
  return()=>{active=false;clearTimeout(timer);};
 },[query]);
 const activePath=(path:string)=>pathname===path.split('?')[0]||(path==='/canvas'&&/^\/projects\/[^/]+\/(canvas|agent)$/.test(pathname))||(path==='/projects'&&pathname.startsWith('/projects/')&&!/^\/projects\/[^/]+\/(canvas|agent)$/.test(pathname))||(path.startsWith('/settings/')&&pathname.startsWith('/settings/'));
 const canvasRoute=/^\/projects\/[^/]+\/(canvas|agent)$/.test(pathname);
 return <div className={'app-shell'+(canvasRoute?' canvas-shell':'')}><aside className="navigation"><LocalLink data-interaction-id="G-01" className="brand" aria-label="AI WORK Studio" href="/projects">AI WORK<span>Studio</span></LocalLink><nav aria-label="主导航">{navigation.map(item=><LocalLink data-interaction-id="G-02" className="nav-link" title={item.label} aria-label={item.label} key={item.path} href={item.path} aria-current={activePath(item.path)?'page':undefined}><span className="nav-symbol" aria-hidden="true">{item.symbol}</span><span className="nav-label">{item.label}</span></LocalLink>)}</nav><div className="navigation-footer">本地工作区<br/>无自动生成<br/><small>开发版本 0.0.1</small></div></aside>
 <div className="app-main"><header className="topbar"><div className="global-search"><input data-interaction-id="G-04" type="search" aria-label="全局搜索" placeholder="搜索项目、节点和提示词" value={query} onChange={event=>setQuery(event.target.value)}/>{query?<div className="search-results" aria-live="polite">{searchState==='loading'?'正在搜索本地内容…':searchState==='failed'?'本地内容读取失败，请稍后重试。':results.length?results.map(item=><LocalLink data-interaction-id="ui:App:LocalLink:ae4ca59b5240" key={item.path+' '+item.title} href={item.path} onClick={()=>setQuery('')}><small>{item.kind} · </small>{item.title}</LocalLink>):'没有匹配内容'}<Button data-interaction-id="ui:App:Button:5fb52b9d8e3e" onClick={()=>setQuery('')}>清除搜索</Button></div>:null}</div><Button className="command-trigger" data-interaction-id="G-03" onClick={()=>setCommandOpen(true)}>命令面板</Button><Button className="api-status-trigger" data-interaction-id="G-05" onClick={()=>setConnectionOpen(true)}><ConnectionStatus channel="text" compact/><ConnectionStatus channel="video" model={preferences.defaultVideoModel} spec={videoStatusSpec(preferences.defaultVideoModel,preferences.defaultDuration,preferences.defaultRatio)} compact/></Button><Button data-interaction-id="ui:App:Button:b3341daeb553" aria-label={theme==='dark'?'切换到浅色主题':'切换到深色主题'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</Button><Button data-interaction-id="G-09" aria-label="通知消息" onClick={()=>setNotificationOpen(true)}>通知</Button><Button data-interaction-id="G-07" aria-label="当前区域帮助" onClick={()=>setHelpOpen(true)}>?</Button></header>
 <main className="page-content"><Suspense fallback={<p role="status">正在加载页面…</p>}>{navigationMessage?<p className="banner warning" role="status">{navigationMessage}</p>:null}<div className="banner narrow-notice">窄屏以浏览为主，画布批量编排与收费快捷键关闭。</div>{pathname==='/welcome'||pathname==='/'?<Welcome/>:!title?<section className="card empty-state"><h1>找不到这个页面</h1><p>页面地址可能已更改。</p><LocalLink data-interaction-id="ui:App:LocalLink:7e9d2c5477b0" href="/projects">返回项目</LocalLink></section>:<>{!canvasRoute&&!/^\/projects\/[^/]+\/results$/.test(pathname)?<div className="page-header"><div><h1>{title}</h1><p className="muted">{copy.local}</p></div></div>:null}{/^\/projects\/[^/]+\/(canvas|agent)$/.test(pathname)?<CanvasPage key={pathname.split("/")[2]} projectId={decodeURIComponent(pathname.split('/')[2])}/>:/^\/projects\/[^/]+\/results$/.test(pathname)?<ResultPage key={pathname} projectId={decodeURIComponent(pathname.split('/')[2])}/>: /^\/projects\/[^/]+\/compare$/.test(pathname)?<ComparePage key={pathname} projectId={decodeURIComponent(pathname.split('/')[2])}/>:pathname.startsWith('/settings/')?<SettingsPage pathname={pathname}/>:pathname==='/projects/packages'?<PackagePage/>:pathname==='/canvas'?<CanvasEntryPage/>:pathname==='/projects'?<ProjectsPage/>:pathname==='/prompt-generator'||pathname==='/prompt-generator/history'?<PromptGeneratorPage/>:pathname==='/prompts'?<PromptsPage/>:pathname==='/assets'?<AssetsPage/>:pathname==='/trash'?<TrashPage/>:pathname==='/tasks'?<TasksPage/>:pathname==='/activity'?<ActivityPage/>:pathname==='/recovery'?<RecoveryCenter/>:pathname==='/help'?<HelpPage/>:<section className="card empty-state"><h2>{pathname==='/projects'?'从一个项目开始':'暂无内容'}</h2><p>{pathname==='/projects'?'本地整理不会创建生成任务。':'你可以先整理项目和创作草稿。'}</p>{pathname==='/projects'?<LocalLink data-interaction-id="ui:App:LocalLink:afd303a98a52" href="/welcome">查看使用引导</LocalLink>:null}</section>}</>}</Suspense></main></div>
 <Dialog open={commandOpen} title="命令面板" onClose={()=>setCommandOpen(false)} footer={<Button data-interaction-id="ui:App:Button:27ab626d804f" onClick={()=>setCommandOpen(false)}>关闭</Button>}><label>搜索操作<input data-interaction-id="ui:App:input:8987aba776bb" value={commandQuery} onChange={event=>setCommandQuery(event.target.value)}/></label><ul className="command-list">{navigation.filter(item=>item.label.includes(commandQuery)).map(item=><li key={item.path}><Button data-interaction-id="ui:App:Button:e8b228147e3f" onClick={()=>{setCommandOpen(false);navigate(item.path);}}>{'前往'+item.label}</Button></li>)}</ul>{!navigation.some(item=>item.label.includes(commandQuery))?<p>没有匹配操作</p>:null}<Button data-interaction-id="ui:App:Button:9bc54e02a248" onClick={()=>setShortcutOpen(true)}>快捷键说明</Button></Dialog>
 <Dialog open={shortcutOpen} title="快捷键说明" onClose={()=>setShortcutOpen(false)} footer={<Button data-interaction-id="ui:App:Button:579849abf126" onClick={()=>setShortcutOpen(false)}>关闭</Button>}><div className="keyboard-list"><div><kbd>Ctrl / Cmd + K</kbd> 命令面板</div><div><kbd>Esc</kbd> 关闭最上层面板</div><p>输入框与输入法组合优先。生成快捷键只打开确认，不直接提交。</p></div></Dialog>
 <Dialog open={connectionOpen} title="连接详情" onClose={()=>setConnectionOpen(false)} footer={<Button data-interaction-id="ui:App:Button:9158d683ad0f" onClick={()=>setConnectionOpen(false)}>关闭</Button>}><ConnectionStatus channel="text"/><ConnectionStatus channel="video" model={preferences.defaultVideoModel} spec={videoStatusSpec(preferences.defaultVideoModel,preferences.defaultDuration,preferences.defaultRatio)}/>{activeCore?<><p>当前服务：{activeCore.client.profile.name} · {activeCore.client.profile.originSnapshot}</p><p>原授权绑定：{activeCore.client.binding.id}。目录只读核验不等于收费许可。</p></>:<p>当前为本地模式，服务能力尚未验证。</p>}<p>切换连接不会改写旧任务的服务或授权绑定。</p><LocalLink data-interaction-id="ui:App:LocalLink:d8967db57b80" href="/settings/connections" onClick={()=>setConnectionOpen(false)}>配置 Core 连接</LocalLink></Dialog>
 <Dialog open={helpOpen} title="当前区域帮助" onClose={()=>setHelpOpen(false)} footer={<Button data-interaction-id="ui:App:Button:e67456395441" onClick={()=>setHelpOpen(false)}>关闭</Button>}><LocalHelp/><small>浏览器时区：{browserTimeZone()}；持久时间来源为 UTC。</small></Dialog>
 <Dialog open={notificationOpen} title="通知消息" onClose={()=>setNotificationOpen(false)} footer={<Button data-interaction-id="ui:App:Button:b93c5d5dcd8f" onClick={()=>setNotificationOpen(false)}>关闭</Button>}><p>保存失败与提交未知等重要信息保留到处理，不代表远端已失败或退款。</p><LocalLink data-interaction-id="ui:App:LocalLink:ce08353a84ed" href="/recovery" onClick={()=>setNotificationOpen(false)}>打开恢复中心</LocalLink></Dialog>
 </div>;
}




