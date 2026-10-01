import {useEffect,useState} from 'react';
import type {CapabilityProfile} from '../../domain/connection';
import {withDatabase,transact,requestResult} from '../../infrastructure/storage/database';
import {sanitizeKnownSecrets} from '../../security/credential-session';
type Evidence={verifiedAt?:number;references:string[];stale:boolean};
export function CapabilityEvidence({profileId,capability}:{profileId?:string;capability?:CapabilityProfile}){
 const [evidence,setEvidence]=useState<Evidence>({references:[],stale:false}),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setEvidence({references:[],stale:false});setError('');if(profileId)void withDatabase(undefined,db=>transact(db,['receipts'],'readonly',tx=>requestResult<Record<string,unknown>|undefined>(tx.objectStore('receipts').get('connection-catalog:'+profileId)))).then(row=>{if(!alive)return;const references=Array.isArray(row?.evidence)?row.evidence.flatMap(item=>item&&typeof item==='object'&&typeof item.reference==='string'?[sanitizeKnownSecrets(item.reference.slice(0,2048))]:[]):[];const verifiedAt=typeof row?.verifiedAt==='number'&&Number.isFinite(row.verifiedAt)&&Number.isFinite(new Date(row.verifiedAt).getTime())?row.verifiedAt:undefined;setEvidence({references,verifiedAt,stale:row?.stale===true});}).catch(()=>{if(alive)setError('核验证据读取失败；现有模型目录和默认值保留。');});return()=>{alive=false;};},[profileId,capability]);
 return <div>{error?<p role="alert">{error}</p>:null}<p>最近验证时间：{evidence.verifiedAt===undefined?'最近验证时间未知':<time dateTime={new Date(evidence.verifiedAt).toISOString()}>{new Date(evidence.verifiedAt).toLocaleString('zh-CN')}</time>}</p>{evidence.stale?<p>上次目录已过期，需重新只读核验。</p>:null}{evidence.references.length?<ul>{evidence.references.map((reference,index)=><li key={index}>{reference}</li>)}</ul>:<p>证据来源未知；本地目录不代表真实服务联调通过。</p>}</div>;
}
