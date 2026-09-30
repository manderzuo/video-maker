import type {ValidationResult} from '../../domain/common';
export function normalizeCoreBase(value:string):ValidationResult<string>{
 const fail=():ValidationResult<string>=>({ok:false,issues:[{code:'core_base_invalid',path:'base',message:'请选择部署已登记的HTTPS或本机地址；地址不能含凭据、查询、片段或路径穿越。'}]});
 if(typeof value!=='string')return fail();const text=value.trim();if(!text||/[\\%?#\s\u0000-\u001f]/.test(text)||/(?:^|\/)\.\.?($|\/)/.test(text)||/(?:\/v1){2}(?:\/|$)/.test(text))return fail();
 if(text.startsWith('/')){if(!/^\/core-api(?:\/registered\/[A-Za-z0-9_-]+)?(?:\/v1)?\/?$/.test(text))return fail();return {ok:true,value:text.replace(/\/$/,'').replace(/\/v1$/,'')};}
 try{if(!/^https?:\/\//.test(text))return fail();const url=new URL(text);if(url.username||url.password||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname.includes('//')||url.pathname.split('/').some(p=>['admin','internal','bridge'].includes(p.toLowerCase())))return fail();const pathname=url.pathname.replace(/\/$/,'').replace(/\/v1$/,'');return {ok:true,value:url.origin+pathname};}catch{return fail();}
}
