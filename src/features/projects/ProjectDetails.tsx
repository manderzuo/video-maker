import {useEffect,useState} from 'react';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import {browserTimeZone,displayUtcTime} from '../../ui/copy.zh-CN';
import {projectDetails,projectError} from './project-service';
export function ProjectDetails({projectId,onClose}:{projectId:string|null;onClose:()=>void}){
 const [details,setDetails]=useState<Awaited<ReturnType<typeof projectDetails>>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setDetails(null);setError('');if(projectId)projectDetails(projectId).then(value=>{if(active)setDetails(value);}).catch(error=>{if(active)setError(projectError(error));});return()=>{active=false;};},[projectId]);
 return <Dialog open={!!projectId} title="项目详情" onClose={onClose} footer={<Button data-interaction-id="ui:ProjectDetails:Button:e8b0366eaa87" onClick={onClose}>关闭</Button>}>{error?<p role="alert">{error}</p>:!details?<p>正在读取本地记录…</p>:<dl><dt>名称</dt><dd>{details.project.title}</dd><dt>素材 / 节点 / 任务</dt><dd>{details.assetCount} / {details.nodeCount} / {details.runCount}</dd><dt>已知素材大小</dt><dd>{details.actualKnownBytes} B{details.missing?'；'+details.missing+' 项文件待重新关联':''}</dd><dt>最后修改</dt><dd>{displayUtcTime(details.project.updatedAt)} · {browserTimeZone()}<br/><small>UTC：{new Date(details.project.updatedAt).toISOString()}</small></dd><dt>最后备份</dt><dd>{details.lastBackup?displayUtcTime(details.lastBackup.createdAt)+' · '+(details.lastBackup.mode==='full'?'完整包':'仅结构')+'下载已触发，实际保存需自行确认':'尚无备份记录'}</dd></dl>}</Dialog>;
}
