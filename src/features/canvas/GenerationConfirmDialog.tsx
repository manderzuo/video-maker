import {useState} from 'react';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import type {RunPlan} from '../../application/runs/preflight';
import type {ConfirmDecision,ApprovedRun} from '../../application/runs/approval';
export function GenerationConfirmDialog({plan,onClose,onConfirm}:{plan:RunPlan;onClose:()=>void;onConfirm:(decision:ConfirmDecision)=>Promise<ApprovedRun>}){
 const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog open title="生成确认单" width={720} onClose={onClose} dismissible={!busy} footer={<><Button data-interaction-id="V-10" disabled={busy} onClick={onClose}>返回编辑</Button><Button variant="primary" data-interaction-id="V-09" busy={busy} disabled={!ack||!!error} disabledReason={!ack?'请确认所列输入与费用提示':error?'输入或授权已变化，请返回并重新预检':undefined} onClick={async()=>{if(busy)return;setBusy(true);try{await onConfirm({confirmed:true,kind:'video',planHash:plan.planHash,nodeCount:plan.nodes.length,acknowledgeUnknownFee:true});}catch{setError('输入、画布版本或授权已变化，或确认保存失败。请返回编辑，保留草稿并重新预检。');}finally{setBusy(false);}}}>确认提交 {plan.nodes.length} 项</Button></>}>
 <p>本次仅确认以下 {plan.nodes.length} 项可见输入。可能消耗积分，金额未知；本地校验不保证 Core 准入。</p><p>服务：{plan.connection.name} · 授权档案：{plan.binding.id.slice(0,8)} · 画布版本：{plan.revision}</p>
 <ol>{plan.nodes.map(node=><li key={node.nodeId}><strong>{node.title}</strong><p>模型 {node.inputSnapshot.spec.modelId} · {node.inputSnapshot.spec.durationSeconds} 秒 · {node.inputSnapshot.spec.ratio}{node.inputSnapshot.spec.resolution?' · '+node.inputSnapshot.spec.resolution:''}</p><pre className="prompt-preview">{node.inputSnapshot.prompt}</pre>{node.assets.length?<ul>{node.assets.map((asset,index)=><li key={asset.assetId}>{node.inputSnapshot.references[index].alias} · {asset.title} · {asset.bytes} 字节</li>)}</ul>:<p>不发送素材；仅传提示词正文。</p>}{node.dependencies.length?<p>下游依赖：{node.dependencies.join('、')}。未产生的输出须在可见后另行确认。</p>:null}</li>)}</ol>
 <p>确认只用于当前输入和一次提交；结果不明时保持原请求，不自动创建新尝试。停止查询不等于取消或退款。</p>
 <label className="generation-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>我确认以上输入，并知悉可能消耗积分且金额未知</label>{error?<p role="alert">{error}</p>:null}
 </Dialog>;
}
