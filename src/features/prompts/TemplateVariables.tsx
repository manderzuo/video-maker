import {useState} from 'react';
import type {PromptLibraryEntry} from '../../domain/prompt';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import {fillTemplate,templateNames} from './prompt-library';
export function TemplateVariables({entry,onClose,onTarget}:{entry:PromptLibraryEntry;onClose:()=>void;onTarget:(text:string,mode:'insert'|'apply')=>void}){const [values,setValues]=useState<Record<string,string>>({}),[message,setMessage]=useState('');const filled=fillTemplate(entry,values),names=templateNames(entry);
 return <Dialog open title="填写模板变量" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button disabled={!filled.ok} disabledReason={!filled.ok?'请填写所有变量并满足文本限制。':undefined} onClick={async()=>{if(!filled.ok)return;try{await navigator.clipboard.writeText(filled.value);setMessage('已复制最终提示词');}catch{setMessage('剪贴板权限被拒绝，请选中最终提示词手动复制。');}}}>复制最终提示词</Button><Button disabled={!filled.ok} onClick={()=>{if(filled.ok)onTarget(filled.value,'insert');}}>插入画布</Button><Button disabled={!filled.ok} onClick={()=>{if(filled.ok)onTarget(filled.value,'apply');}}>应用到文本节点</Button></>}><p>填写只改变本次副本，源模板与生成授权保持不变。</p>{names.map(name=><label key={name}>{'变量 '+name}<input value={values[name]??''} onChange={event=>setValues(current=>({...current,[name]:event.target.value}))}/></label>)}{!filled.ok?<ul>{filled.issues.map((issue,index)=><li key={index}>{issue.message}</li>)}</ul>:null}<label>最终提示词<textarea aria-label="最终提示词" readOnly value={filled.ok?filled.value:''}/></label>{message?<p role="status">{message}</p>:null}</Dialog>;
}

