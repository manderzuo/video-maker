import {useState} from 'react';
import type {ApprovedPromptInput,PromptOptimizationPreview} from '../../application/prompts/optimize-text';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
// Only an unresolved earlier request needs an additional duplicate-charge decision.
export function AIOptimizeDialog({preview,onClose,onConfirm}:{preview:PromptOptimizationPreview;onClose:()=>void;onConfirm:(input:ApprovedPromptInput)=>Promise<void>}){
 const [priorAck,setPriorAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog open title="核对旧文字请求" width={720} onClose={onClose} dismissible={!busy} footer={<><Button data-interaction-id="ui:AIOptimizeDialog:Button:59bcccc6200b" disabled={busy} onClick={onClose}>取消</Button><Button data-interaction-id="PG17" disabled={busy||!priorAck} onClick={async()=>{if(busy||!priorAck)return;setBusy(true);try{await onConfirm({preview,decision:{confirmed:true,acknowledgeTextFee:true,acknowledgePriorUnknown:true}});}catch{setError('草稿、授权或存储已变化；请保留原文后重新点击AI优化。');}finally{setBusy(false);}}}>确认新的文字请求</Button></>}>
 <p className="banner warning">旧文字请求结果或账务尚未核对。新请求使用新的身份，可能再次产生费用，不会替换或取消旧请求。</p><p>使用设置中的文字模型：{preview.textModelId}</p><label className="generation-ack"><input data-interaction-id="ui:AIOptimizeDialog:input:d5e13b348fa4" type="checkbox" disabled={busy} checked={priorAck} onChange={event=>setPriorAck(event.target.checked)}/>我已核对旧请求，仍确认创建新的文字请求</label>{error?<p role="alert">{error}</p>:null}
 </Dialog>;
}
