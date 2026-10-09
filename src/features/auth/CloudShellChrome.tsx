import {useEffect,useState} from 'react';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {navigate,LocalLink,useRoute} from '../../app/routes';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {attentionItems} from '../workspace/cloud-attention';
type Hit={kind:'项目'|'节点'|'提示词';title:string;href:string};
export function CloudGlobalSearch({client}:{client:WorkspaceClient}){
 const [query,setQuery]=useState(''),[hits,setHits]=useState<Hit[]>([]),[state,setState]=useState<'idle'|'loading'|'ready'|'failed'>('idle');
 useEffect(()=>{
  if(!query.trim()){setHits([]);setState('idle');return;}
  setState('loading');let active=true;const timer=setTimeout(async()=>{
   try{
    const needle=query.trim().toLocaleLowerCase();
    const [projects,prompts]=await Promise.all([client.listProjects(),client.listPrompts()]);
    const graphs=await Promise.all(projects.map(async project=>({project,graph:await client.readGraph(project.id)})));
    if(!active)return;
    const found:Hit[]=[];
    for(const project of projects)if((project.title+' '+(project.description??'')).toLocaleLowerCase().includes(needle))found.push({kind:'项目',title:project.title,href:'/projects/'+encodeURIComponent(project.id)+'/canvas'});
    for(const {project,graph} of graphs)for(const node of graph.nodes)if(node.title.toLocaleLowerCase().includes(needle))found.push({kind:'节点',title:node.title,href:'/projects/'+encodeURIComponent(project.id)+'/canvas?node='+encodeURIComponent(node.id)});
    for(const entry of prompts)if((entry.title+' '+entry.body+' '+entry.tags.join(' ')).toLocaleLowerCase().includes(needle))found.push({kind:'提示词',title:entry.title,href:'/prompts?q='+encodeURIComponent(entry.title)});
    setHits(found.slice(0,20));setState('ready');
   }catch{if(active)setState('failed');}
  },300);
  return()=>{active=false;clearTimeout(timer);};
 },[client,query]);
 return <div className="global-search"><input data-interaction-id="account:search" type="search" aria-label="全局搜索" placeholder="搜索项目、节点和提示词" value={query} onChange={event=>setQuery(event.target.value)} style={{minHeight:44}}/>{query?<div className="search-results" aria-live="polite">{state==='loading'?'正在搜索云端内容…':state==='failed'?'云端内容读取失败，请稍后重试。':hits.length?hits.map(item=><LocalLink data-interaction-id="account:search:hit" key={item.kind+' '+item.href+' '+item.title} href={item.href} onClick={()=>setQuery('')}><small>{item.kind} · </small>{item.title}</LocalLink>):'没有匹配内容'}<Button data-interaction-id="account:search:clear" onClick={()=>setQuery('')}>清除搜索</Button></div>:null}</div>;
}
const destinations=[{label:'项目',href:'/projects'},{label:'素材库',href:'/assets'},{label:'提示词库',href:'/prompts'},{label:'提示词写作',href:'/prompt-generator'},{label:'任务中心',href:'/tasks'},{label:'回收站',href:'/trash'},{label:'活动',href:'/activity'},{label:'恢复',href:'/recovery'},{label:'API 设置',href:'/settings/connections'},{label:'账号偏好',href:'/settings/appearance'},{label:'旧版数据迁移',href:'/settings/migration'},{label:'帮助',href:'/help'}];
export function CloudCommandPalette({projectId}:{projectId?:string}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='k'||event.isComposing||(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT')))return;event.preventDefault();setQuery('');setOpen(true);};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[]);
 const entries=[...destinations,...(projectId?[{label:'项目画布',href:'/projects/'+encodeURIComponent(projectId)+'/canvas'},{label:'视频结果',href:'/projects/'+encodeURIComponent(projectId)+'/results'},{label:'A/B 比较',href:'/projects/'+encodeURIComponent(projectId)+'/compare'}]:[])].filter(item=>item.label.includes(query));
 return <><Button data-interaction-id="account:palette" onClick={()=>{setQuery('');setOpen(true);}}>命令面板</Button><Dialog open={open} title="命令面板" onClose={()=>setOpen(false)} footer={<Button data-interaction-id="account:palette:close" onClick={()=>setOpen(false)}>关闭</Button>}><label>搜索操作<input data-interaction-id="account:palette:query" value={query} onChange={event=>setQuery(event.target.value)}/></label><ul className="command-list">{entries.map(item=><li key={item.href+' '+item.label}><Button data-interaction-id="account:palette:go" onClick={()=>{setOpen(false);navigate(item.href);}}>{'前往'+item.label}</Button></li>)}</ul>{entries.length?null:<p>没有匹配操作</p>}<p>Ctrl / Cmd + K 打开命令面板；输入框与输入法组合优先。</p></Dialog></>;
}
export function CloudConnectionStatus({client}:{client:WorkspaceClient}){
 // 只陈述已保存配置与规格核验事实，不把“已保存”说成“已连接”。
 // 视频核验取与当前配置绑定的 videoCapability().verified（按当前地址查合同、
 // 按当前模型过滤规格，配置一改即重算，不会残留旧成功）；此处不做任何探测，
 // 更不发起付费生成。探测成功与否只在 API 设置页当时当地呈现。
 const [open,setOpen]=useState(false),[configs,setConfigs]=useState<{channel:string;apiBase:string;model:string;hasKey:boolean}[]>(),[videoVerified,setVideoVerified]=useState<boolean>(),[failed,setFailed]=useState(false);
 const route=useRoute();
 // 保存、路由变化都重读；序号守卫丢弃迟到响应，旧核验不会盖掉新结果。
 useEffect(()=>{let active=true,seq=0;const load=async()=>{const current=++seq;try{const {configs}=await client.modelConfigs();if(!active||current!==seq)return;setConfigs(configs);setFailed(false);if(!configs.some(config=>config.channel==='video')){setVideoVerified(undefined);return;}try{const capability=await client.videoCapability();if(active&&current===seq)setVideoVerified(capability.verified&&capability.videoSpecs.some(spec=>spec.modelId===capability.model));}catch{if(active&&current===seq)setVideoVerified(false);}}catch{if(active&&current===seq)setFailed(true);}};void load();const onConfig=()=>{void load();};window.addEventListener('aiwork:model-configs-changed',onConfig);return()=>{active=false;window.removeEventListener('aiwork:model-configs-changed',onConfig);};},[client,route]);
 const text=configs?.find(config=>config.channel==='text'),video=configs?.find(config=>config.channel==='video');
 // 新地址保存强制要求密钥（服务端 API_KEY_REQUIRED），无密钥的已存配置经公开
 // 接口不可达，这里只区分未配置/已配置未验证/规格已核验。
 const textLabel=!configs?'…':!text?'文字未配置':'文字已配置·未验证';
 const videoLabel=!configs?'…':!video?'视频未配置':videoVerified===true?'视频规格已核验':'视频已配置·未验证';
 return <><Button data-interaction-id="account:connection" onClick={()=>setOpen(true)}>{configs===undefined?(failed?'连接状态未知':'连接状态读取中'):textLabel+' · '+videoLabel}</Button><Dialog open={open} title="连接详情" onClose={()=>setOpen(false)} footer={<Button data-interaction-id="account:connection:close" onClick={()=>setOpen(false)}>关闭</Button>}>{configs===undefined?<p>{failed?'连接状态读取失败，请稍后重试。':'正在读取连接状态…'}</p>:configs.length?configs.map(config=><p key={config.channel}>{config.channel==='text'?'文字':'视频'}：{config.model} · {config.apiBase}{config.channel==='video'?' · '+(videoVerified===true?'规格已核验':'规格未验证'):''}</p>):<p>尚未保存任何模型配置；生成前请先配置。</p>}<p>此处只反映已保存配置与规格核验，不代表连接探测成功；连接成功、模型目录、规格支持与真实生成结果分别记录，探测请到 API 设置执行。</p><LocalLink data-interaction-id="account:connection:settings" href="/settings/connections" onClick={()=>setOpen(false)}>配置模型连接</LocalLink></Dialog></>;
}
export function CloudNotifications({client}:{client:WorkspaceClient}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<ReturnType<typeof attentionItems>>(),[error,setError]=useState('');
 function load(){setError('');setItems(undefined);void client.listTasks().then(runs=>setItems(attentionItems(runs))).catch(e=>setError(workspaceMessage(e)));}
 return <><Button data-interaction-id="account:notifications" onClick={()=>{setOpen(true);load();}}>通知</Button><Dialog open={open} title="通知消息" onClose={()=>setOpen(false)} footer={<Button data-interaction-id="account:notifications:close" onClick={()=>setOpen(false)}>关闭</Button>}><p>保存失败与提交未知等重要信息保留到处理，不代表远端已失败或退款。</p>{error?<p role="alert">{error}</p>:items===undefined?<p role="status">正在读取通知…</p>:items.length?items.map(item=><article key={item.key} className="card"><h3>{item.title}</h3><p>{item.detail}</p><LocalLink data-interaction-id="account:notifications:open" href={item.href} onClick={()=>setOpen(false)}>前往处理</LocalLink></article>):<p>暂无需要处理的事项。</p>}<LocalLink data-interaction-id="account:notifications:recovery" href="/recovery" onClick={()=>setOpen(false)}>打开恢复中心</LocalLink></Dialog></>;
}
