import type {ValidationResult} from '../../domain/common';
import {normalizeCoreBase} from '../core/url';
import {isOpenCodeGoTarget} from './session-policy';

export function normalizeTextApiBase(value:string):ValidationResult<string>{
 const trimmed=value.trim();
 const withoutEndpoint=trimmed.replace(/\/v1\/chat\/completions\/?$/,'');
 const normalized=normalizeCoreBase(withoutEndpoint);
 if(!normalized.ok)return {ok:false,issues:[{code:'text_base_invalid',path:'base',message:'文字地址须为不含凭据、查询或路径穿越的 HTTPS 或本机地址。'}]};
 return normalized;
}
export function sameTextApiBase(left:string,right:string){const a=normalizeTextApiBase(left),b=normalizeTextApiBase(right);return a.ok&&b.ok&&a.value===b.value;}
export function resolveTextModelId(base:string,input:string,catalog:readonly string[]):ValidationResult<string>{
 void catalog;
 const normalized=normalizeTextApiBase(base),id=input.trim();
 const resolved=normalized.ok&&isOpenCodeGoTarget(normalized.value)&&id.startsWith('opencode-go/')?id.slice('opencode-go/'.length):id;
 if(!normalized.ok||!resolved||resolved.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(resolved))return {ok:false,issues:[{code:'text_model_invalid',path:'model',message:'模型名称须为 1–256 字符且不含控制字符。'}]};
 return {ok:true,value:resolved};
}
