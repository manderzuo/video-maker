import {useEffect,useState} from 'react';
import type {CloudRun} from '../../domain/cloud-video-run';
import {workspaceMessage,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {attentionItems} from './cloud-attention';
export function CloudRecoveryPage({client}:{client:WorkspaceClient}){
 const [runs,setRuns]=useState<CloudRun[]>(),[error,setError]=useState('');
 async function reload(){setError('');try{setRuns(await client.listTasks());}catch(e){setError(workspaceMessage(e));}}
 useEffect(()=>{let active=true;void reload().catch(()=>{if(active)setError('待处理事项读取失败。');});return()=>{active=false;};},[client]);
 const items=runs?attentionItems(runs):undefined;
 return <section className="card" aria-label="恢复中心"><h1>需要处理的事项</h1><p>只提供安全下一步；停止查询不等于取消或退款。未知提交不能清空、改身份或自动重发。画布未保存的修改请回到对应画布页重试保存或明确放弃。</p><div className="actions"><Button data-interaction-id="cloud:recovery:reload" onClick={()=>void reload()}>重新读取</Button><LocalLink data-interaction-id="cloud:recovery:tasks" href="/tasks">打开任务中心</LocalLink><LocalLink data-interaction-id="cloud:recovery:projects" href="/projects">从项目包恢复</LocalLink><LocalLink data-interaction-id="cloud:recovery:migration" href="/settings/migration">旧版数据迁移</LocalLink></div>{error?<p role="alert">{error}</p>:null}{items===undefined?<p role="status">正在读取待处理事项…</p>:items.length?items.map(item=><article key={item.key} className="card"><h2>{item.title}</h2><p>{item.detail}</p><LocalLink data-interaction-id="cloud:recovery:open" href={item.href}>前往处理</LocalLink></article>):<p>暂无待处理事项；本页没有发起业务查询。</p>}</section>;
}
