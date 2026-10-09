import {useId} from 'react';
import {normalizeApiBase,type ModelChannel} from './api-settings-client';
import type {ApiDraft,ApiSettingsStore} from './use-api-settings';
import {ModelPicker} from './ModelPicker';
function connectionLine(draft:ApiDraft){
 const result=draft.result;if(!result)return '尚未检测。点“测试连接”立即检测，只读目录，不调用生成。';
 const count=result.models.length,time=draft.testedAt?new Date(draft.testedAt).toLocaleString():'';
 const partial=result.complete===false?'列表未完整获取；':'';
 if(result.connection==='verified'&&result.catalogStatus==='ready')return `连接成功 · 已获取 ${count} 个模型${time?' · '+time:''}。${partial}测试不代表生成已验证。`;
 if(result.connection==='verified')return `连接成功 · 服务未返回模型${time?' · '+time:''}，可手动填写。${partial}测试不代表生成已验证。`;
 if(result.connection==='unknown')return `连接状态未确认${time?' · '+time:''}。${partial}目录不支持或响应无效，不能视为成功；可手动填写模型名称后保存。`;
 if(result.catalogStatus==='empty')return '模型列表为空，可手动填写模型名称后保存。';
 return '权限或密钥错误，请检查地址和密钥。';
}
export function ApiModelFields({channel,draft,store,ready}:{channel:ModelChannel;draft:ApiDraft;store:ApiSettingsStore;ready:boolean}){
 const id=useId(),title=channel==='video'?'视频 API':'文字 API';
 let sameAddress=false;try{sameAddress=draft.saved?.apiBase===normalizeApiBase(draft.apiBase);}catch{/* Invalid draft cannot reuse a saved key. */}
 const warnedModel=draft.model.trim()&&draft.result&&!draft.result.models.some(model=>model.toLowerCase()===draft.model.trim().toLowerCase());
 const modelField=<div className="api-field"><label htmlFor={id+'-model'}>模型名称</label>
   <ModelPicker id={id+'-model'} value={draft.model} models={draft.result?.models??[]} disabled={!ready} onChange={value=>store.edit(channel,'model',value)}/>
   <p id={id+'-model-help'} className="muted">展示当前密钥能获取到的全部目录项，可填写目录以外的模型名称。</p>
   {warnedModel?<p className="muted">该模型不在当前目录中，将按手填值保存；实际生成前仍按已核验规格核对，不静默替换能力。</p>:null}
  </div>;
 const keyField=<div className="api-field"><label htmlFor={id+'-apiKey'}>密钥</label>
   <input data-interaction-id={'task3:'+channel+':apiKey'} data-field="apiKey" id={id+'-apiKey'} type="password" value={draft.apiKey} maxLength={4096} autoComplete="off" spellCheck={false} placeholder={draft.saved?.hasKey&&sameAddress?'已保存；留空继续使用':'输入 API 密钥'} onChange={event=>store.edit(channel,'apiKey',event.target.value)}/>
  </div>;
 return <section className="card api-model-card" role="region" aria-labelledby={id+'-title'}>
  <h2 id={id+'-title'}>{title}</h2><p className="muted">{channel==='text'?'先填写地址和密钥，再测试获取模型列表。':'填写连接信息和要使用的模型。'}</p>
  <fieldset className="api-model-fields" disabled={!ready}><legend className="sr-only">{title}连接信息</legend>
   <div className="api-field"><label htmlFor={id+'-apiBase'}>地址</label>
    <input data-interaction-id={'task3:'+channel+':apiBase'} data-field="apiBase" id={id+'-apiBase'} type="text" value={draft.apiBase} maxLength={2048} autoComplete="off" spellCheck={false} placeholder="https://api.example.com" onChange={event=>store.edit(channel,'apiBase',event.target.value)}/>
   </div>
   {channel==='video'?<>{modelField}{keyField}</>:<>{keyField}{modelField}</>}
   <div className="api-actions"><button data-interaction-id={'task3:'+channel+':test'} type="button" className="button" disabled={draft.pending!==null} onClick={()=>{void store.test(channel);}}>{draft.pending==='test'?'测试中…':'测试连接'}</button><button data-interaction-id={'task3:'+channel+':save'} type="button" className="button primary" disabled={draft.pending!==null||draft.conflict} onClick={()=>{void store.save(channel);}}>{draft.pending==='save'?'保存中…':'保存'}</button></div>
  </fieldset>
  {draft.pending==='test'?<p className="api-feedback muted" role="status">正在检测连接和模型目录…</p>:<p className="api-feedback" role="status">{connectionLine(draft)}</p>}
  {draft.message?<p className="api-feedback" role="status">{draft.message}</p>:null}
  {draft.error?<p className="api-feedback error" role="alert">{draft.error}</p>:null}
 </section>;
}
