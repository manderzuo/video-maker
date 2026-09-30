import {useState} from 'react';
import {useRoute,navigate,LocalLink} from '../../app/routes';
import {Button} from '../../ui/Button';
import {useResultResources,reviewAsset,ReviewMedia,ResultSnapshot,ResultActions} from './review-components';
export function ResultPage({projectId}:{projectId:string}){
 const route=useRoute(),params=new URLSearchParams(route.split('?')[1]??''),{resources,error,reload}=useResultResources(projectId),[comparison,setComparison]=useState<string[]>([]),[message,setMessage]=useState('');
 if(error)return <p role="alert">{error}</p>;if(!resources)return <p role="status">正在读取原结果记录…</p>;const completed=resources.runs.filter(r=>r.executionState==='succeeded'),id=params.get('runId')??params.get('run')??completed[0]?.id,run=completed.find(r=>r.id===id);
 if(!run)return <section className="card"><p>暂无所选已完成结果；原任务历史保留。</p><LocalLink href="/tasks">查看本地任务中心</LocalLink></section>;const asset=reviewAsset(resources,run);
 return <section aria-label="视频审片"><div className="actions"><LocalLink href={'/projects/'+encodeURIComponent(projectId)+'/canvas'}>返回画布</LocalLink><LocalLink href="/tasks">查看本地任务中心</LocalLink><label>历史版本<select aria-label="历史版本" value={run.id} onChange={e=>navigate('/projects/'+encodeURIComponent(projectId)+'/results?runId='+encodeURIComponent(e.target.value))}>{completed.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}</select></label></div><p>历史版本只读，查看不会改默认下游输入。</p>
 <ReviewMedia asset={asset}/><ResultSnapshot run={run} asset={asset}/><ResultActions key={run.id} run={run} asset={asset} resources={resources} onChange={reload}/>
 <h3>比较两个版本</h3>{completed.map(r=><label className="review-choice" key={r.id}><input type="checkbox" checked={comparison.includes(r.id)} onChange={e=>{if(e.target.checked){if(comparison.length>=2){setMessage('只能选择两个不同版本进行比较。');return;}setComparison(v=>[...v,r.id]);}else setComparison(v=>v.filter(id=>id!==r.id));}}/>{r.id}</label>)}<Button data-interaction-id="R-08" disabled={comparison.length!==2} onClick={()=>navigate('/projects/'+encodeURIComponent(projectId)+'/compare?runs='+encodeURIComponent(comparison.join(',')))}>比较所选版本</Button><p role="status">{message}</p></section>;
}
