import {useId} from 'react';
import {normalizeApiBase,type ModelChannel} from './api-settings-client';
import type {ApiDraft,ApiSettingsStore} from './use-api-settings';
function probeMessage(draft:ApiDraft){
 const result=draft.result;if(!result)return '';
 if(result.connection==='failed')return '连接测试未通过，请检查地址和密钥。';
 if(result.catalogStatus==='ready')return '已获取模型列表，可选择或手动填写。此测试不代表生成已验证。';
 if(result.catalogStatus==='empty')return '模型列表为空，可手动填写模型名称后保存。';
 if(result.catalogStatus==='unavailable')return '模型目录不可用，可手动填写模型名称后保存。';
 return '未能获取有效模型列表，可手动填写模型名称后保存。';
}
export function ApiModelFields({channel,draft,store,ready}:{channel:ModelChannel;draft:ApiDraft;store:ApiSettingsStore;ready:boolean}){
 const id=useId(),title=channel==='video'?'视频 API':'文字 API';
 let sameAddress=false;try{sameAddress=draft.saved?.apiBase===normalizeApiBase(draft.apiBase);}catch{/* Invalid draft cannot reuse a saved key. */}
 const fields=channel==='video'?['apiBase','model','apiKey'] as const:['apiBase','apiKey','model'] as const;
 return <section className="card api-model-card" role="region" aria-labelledby={id+'-title'}>
  <h2 id={id+'-title'}>{title}</h2><p className="muted">{channel==='text'?'先填写地址和密钥，再测试获取模型列表。':'填写连接信息和要使用的模型。'}</p>
  <fieldset className="api-model-fields" disabled={!ready}><legend className="sr-only">{title}连接信息</legend>
   {fields.map(field=>{
    const label=field==='apiBase'?'地址':field==='model'?'模型名称':'密钥';
    return <div className="api-field" key={field}><label htmlFor={id+'-'+field}>{label}</label>
     <input data-interaction-id={'task3:'+channel+':'+field} data-field={field} id={id+'-'+field} type={field==='apiKey'?'password':'text'} value={draft[field]} maxLength={field==='apiBase'?2048:field==='model'?256:4096} autoComplete="off" spellCheck={false} list={field==='model'?id+'-models':undefined} aria-describedby={field==='model'?id+'-model-help':undefined} placeholder={field==='apiBase'?'https://api.example.com':field==='model'?'选择模型或手动填写':draft.saved?.hasKey&&sameAddress?'已保存；留空继续使用':'输入 API 密钥'} onChange={event=>store.edit(channel,field,event.target.value)}/>
     {field==='model'?<><datalist id={id+'-models'}>{draft.result?.models.map(model=><option key={model} value={model}/>)}</datalist><p id={id+'-model-help'} className="muted">可填写目录以外的模型名称。</p></>:null}
    </div>;
   })}
   <div className="api-actions"><button data-interaction-id={'task3:'+channel+':test'} type="button" className="button" disabled={draft.pending!==null} onClick={()=>{void store.test(channel);}}>{draft.pending==='test'?'测试中…':'测试连接'}</button><button data-interaction-id={'task3:'+channel+':save'} type="button" className="button primary" disabled={draft.pending!==null||draft.conflict} onClick={()=>{void store.save(channel);}}>{draft.pending==='save'?'保存中…':'保存'}</button></div>
  </fieldset>
  {draft.pending==='test'?<p className="api-feedback muted" role="status">正在检查连接和模型目录…</p>:draft.message||draft.result?<p className="api-feedback" role="status">{draft.message||probeMessage(draft)}</p>:null}
  {draft.error?<p className="api-feedback error" role="alert">{draft.error}</p>:null}
 </section>;
}
