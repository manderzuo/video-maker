import {useEffect,useRef,useState,type ReactElement} from 'react';
import {navigation} from './navigation';
import {LocalLink,navigate,routeTitle,useRoute} from './routes';
import {Button} from '../ui/Button';
import {Dialog} from '../ui/Dialog';
import {copy,isEditableTarget,browserTimeZone} from '../ui/copy.zh-CN';
import {withDatabase,transact,requestResult} from '../infrastructure/storage/database';
import {projectSchema} from '../domain/project';
import {graphSchema} from '../domain/graph';
import {ProjectsPage} from '../features/projects/ProjectsPage';
import {TrashPage} from '../features/projects/TrashPage';
import '../ui/tokens.css';
type SearchItem={title:string;path:string;kind:string};
function Welcome(){
 const [address,setAddress]=useState(''),[error,setError]=useState(''),[visible,setVisible]=useState(false);
 const keyField=useRef<HTMLInputElement>(null);
 function validateAddress(){
  if(!address.trim())return;
  try{const url=new URL(address.trim());if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error();setAddress(url.href.replace(/\/+$/,''));setError('');}catch{setError('请输入允许的 HTTPS 服务地址，不含用户名、密码或查询凭据。');}
 }
 function localMode(){try{localStorage.setItem('aiwork-studio:onboarding','1');}catch{/* Navigation still works; storage assessment follows. */}navigate('/projects');}
 return <section className="card welcome"><h1>开始你的创作项目</h1><p className="muted">画布保存在当前浏览器，生成任务由 AI Work Core 处理。</p><div className="welcome-grid"><ol className="welcome-steps"><li>1 · 连接服务</li><li>2 · 测试权限</li><li>3 · 创建项目</li></ol><div className="form-stack">
  <label>Core 服务地址<input value={address} placeholder="https://你的 Core 服务" onChange={event=>{setAddress(event.target.value);setError('');}} onBlur={validateAddress} autoComplete="off"/></label>{error?<p role="alert" className="banner error">{error}</p>:null}
  <label>普通用户 Key<input ref={keyField} type={visible?'text':'password'} autoComplete="off" onBlur={()=>setVisible(false)} spellCheck={false}/></label>
  <Button aria-pressed={visible} onMouseDown={event=>event.preventDefault()} onBlur={()=>setVisible(false)} onClick={()=>{setVisible(value=>!value);keyField.current?.focus();}}>{visible?'隐藏 Key':'显示 Key'}</Button>
  <small>Key 仅当前标签页内存保存；不读取剪贴板，不记住 Key。</small>
  <Button disabled disabledReason="尚未配置已核验的 Core 通道；可先进入本地模式。">测试连接</Button>
  <div className="actions"><Button variant="primary" data-interaction-id="W-01" onClick={localMode}>进入本地模式</Button><Button data-interaction-id="W-06" onClick={()=>navigate('/projects?create=1')}>继续创建项目</Button><LocalLink href="/settings/connections">配置连接</LocalLink></div>
 </div></div></section>;
}
function LocalHelp(){return <section className="card"><h2>本地创作与保存</h2><p>项目保存在当前浏览器。清除站点数据前，请导出项目备份。</p><p>整理素材、编辑画布和提示词不会调用模型。生成视频和文字优化分别确认。</p><p>提交结果暂未确认时，保留原任务并查询；停止查询不等于取消或退款。</p><LocalLink href="/welcome">重新查看使用引导</LocalLink></section>;}
export function App():ReactElement{
 const route=useRoute(),pathname=route.split('?')[0],title=routeTitle(pathname);
 const [theme,setTheme]=useState(()=>{try{return localStorage.getItem('aiwork-studio:theme')==='light'?'light':'dark';}catch{return 'dark';}});
 const [commandOpen,setCommandOpen]=useState(false),[shortcutOpen,setShortcutOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[connectionOpen,setConnectionOpen]=useState(false),[notificationOpen,setNotificationOpen]=useState(false);
 const [commandQuery,setCommandQuery]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState<SearchItem[]>([]),[searchState,setSearchState]=useState<'idle'|'loading'|'ready'|'failed'>('idle');
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('aiwork-studio:theme',theme);}catch{/* Preference is optional. */}},[theme]);
 useEffect(()=>{document.title=(title?title+' · ':'')+'AI WORK Studio';},[title]);
 useEffect(()=>{if(pathname==='/')navigate('/welcome');},[pathname]);
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
     const rows:SearchItem[]=[];
     for(const item of projects){const parsed=projectSchema.safeParse(item);if(parsed.success&&parsed.data.trashedAt===null)rows.push({title:parsed.data.title,path:'/projects/'+encodeURIComponent(parsed.data.id)+'/canvas',kind:'项目'});}
     for(const item of graphs){const parsed=graphSchema.safeParse(item);if(parsed.success)for(const node of parsed.data.nodes)rows.push({title:node.title,path:'/projects/'+encodeURIComponent(parsed.data.projectId)+'/canvas?node='+encodeURIComponent(node.id),kind:'节点'});}
     for(const item of prompts)if(item&&typeof item==='object'&&'id'in item&&'title'in item&&typeof item.id==='string'&&typeof item.title==='string')rows.push({title:item.title,path:'/prompts?entry='+encodeURIComponent(item.id),kind:'提示词'});
     return rows.filter(row=>row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,20);
    }));
    if(active){setResults(found);setSearchState('ready');}
   }catch{if(active)setSearchState('failed');}
  },300);
  return()=>{active=false;clearTimeout(timer);};
 },[query]);
 const activePath=(path:string)=>pathname===path.split('?')[0]||(path==='/projects'&&pathname.startsWith('/projects/'))||(path.startsWith('/settings/')&&pathname.startsWith('/settings/'));
 return <div className="app-shell"><aside className="navigation"><LocalLink className="brand" aria-label="AI WORK Studio" href="/projects">AI WORK<span>Studio</span></LocalLink><nav aria-label="主导航">{navigation.map(item=><LocalLink className="nav-link" key={item.path} href={item.path} aria-current={activePath(item.path)?'page':undefined}><span className="nav-symbol" aria-hidden="true">{item.symbol}</span>{item.label}</LocalLink>)}</nav><div className="navigation-footer">本地工作区<br/>无自动生成<br/><small>开发版本 0.0.1</small></div></aside>
 <div className="app-main"><header className="topbar"><div className="global-search"><input type="search" aria-label="全局搜索" placeholder="搜索项目、节点和提示词" value={query} onChange={event=>setQuery(event.target.value)}/>{query?<div className="search-results" aria-live="polite">{searchState==='loading'?'正在搜索本地内容…':searchState==='failed'?'本地内容读取失败，请稍后重试。':results.length?results.map(item=><LocalLink key={item.path+' '+item.title} href={item.path} onClick={()=>setQuery('')}><small>{item.kind} · </small>{item.title}</LocalLink>):'没有匹配内容'}<Button onClick={()=>setQuery('')}>清除搜索</Button></div>:null}</div><Button className="command-trigger" data-interaction-id="G-03" onClick={()=>setCommandOpen(true)}>命令面板</Button><Button data-interaction-id="G-05" onClick={()=>setConnectionOpen(true)}>本地模式 · 未连接</Button><Button aria-label={theme==='dark'?'切换到浅色主题':'切换到深色主题'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</Button><Button aria-label="通知消息" onClick={()=>setNotificationOpen(true)}>通知</Button><Button aria-label="当前区域帮助" onClick={()=>setHelpOpen(true)}>?</Button></header>
 <main className="page-content"><div className="banner narrow-notice">窄屏以浏览为主，画布批量编排与收费快捷键关闭。</div>{pathname==='/welcome'||pathname==='/'?<Welcome/>:!title?<section className="card empty-state"><h1>找不到这个页面</h1><p>页面地址可能已更改。</p><LocalLink href="/projects">返回项目</LocalLink></section>:<><div className="page-header"><div><h1>{title}</h1><p className="muted">{copy.local}</p></div></div>{pathname==='/projects'?<ProjectsPage/>:pathname==='/trash'?<TrashPage/>:pathname==='/help'?<LocalHelp/>:<section className="card empty-state"><h2>{pathname==='/projects'?'从一个项目开始':'暂无内容'}</h2><p>{pathname==='/projects'?'本地整理不会创建生成任务。':'你可以先整理项目和创作草稿。'}</p>{pathname==='/projects'?<LocalLink href="/welcome">查看使用引导</LocalLink>:null}</section>}</>}</main></div>
 <Dialog open={commandOpen} title="命令面板" onClose={()=>setCommandOpen(false)} footer={<Button onClick={()=>setCommandOpen(false)}>关闭</Button>}><label>搜索操作<input value={commandQuery} onChange={event=>setCommandQuery(event.target.value)}/></label><ul className="command-list">{navigation.filter(item=>item.label.includes(commandQuery)).map(item=><li key={item.path}><Button onClick={()=>{setCommandOpen(false);navigate(item.path);}}>{'前往'+item.label}</Button></li>)}</ul>{!navigation.some(item=>item.label.includes(commandQuery))?<p>没有匹配操作</p>:null}<Button onClick={()=>setShortcutOpen(true)}>快捷键说明</Button></Dialog>
 <Dialog open={shortcutOpen} title="快捷键说明" onClose={()=>setShortcutOpen(false)} footer={<Button onClick={()=>setShortcutOpen(false)}>关闭</Button>}><div className="keyboard-list"><div><kbd>Ctrl / Cmd + K</kbd> 命令面板</div><div><kbd>Esc</kbd> 关闭最上层面板</div><p>输入框与输入法组合优先。生成快捷键只打开确认，不直接提交。</p></div></Dialog>
 <Dialog open={connectionOpen} title="连接详情" onClose={()=>setConnectionOpen(false)} footer={<Button onClick={()=>setConnectionOpen(false)}>关闭</Button>}><p>当前为本地模式，服务能力尚未验证。</p><p>切换连接不会改写旧任务的服务或授权绑定。</p><LocalLink href="/settings/connections" onClick={()=>setConnectionOpen(false)}>配置 Core 连接</LocalLink></Dialog>
 <Dialog open={helpOpen} title="当前区域帮助" onClose={()=>setHelpOpen(false)} footer={<Button onClick={()=>setHelpOpen(false)}>关闭</Button>}><LocalHelp/><small>浏览器时区：{browserTimeZone()}；持久时间来源为 UTC。</small></Dialog>
 <Dialog open={notificationOpen} title="通知消息" onClose={()=>setNotificationOpen(false)} footer={<Button onClick={()=>setNotificationOpen(false)}>关闭</Button>}><p>暂无通知。保存失败与提交未知等重要信息会保留到处理。</p></Dialog>
 </div>;
}

