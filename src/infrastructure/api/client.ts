import {z} from 'zod';
export type RequestIdentity={contextId:string;csrfToken:string};
export class ApiError extends Error{
 constructor(public readonly status:number,public readonly code:string,public readonly issues?:string[]){super(code);}
}
const codes=new Set(['AUTH_REQUIRED','AUTH_INVALID','SESSION_CHANGED','CSRF_INVALID','PREAUTH_INVALID','USERNAME_TAKEN','RATE_LIMITED','REVISION_CONFLICT','INVALID_REQUEST','BODY_TOO_LARGE','NOT_FOUND','INTERNAL_ERROR']);
export function apiMessage(error:unknown){
 const code=error instanceof ApiError?error.code:'';
 const messages:Record<string,string>={AUTH_REQUIRED:'登录已过期，请重新登录。',AUTH_INVALID:'用户名或密码不正确。',SESSION_CHANGED:'账号已变化，请重新确认登录状态。',CSRF_INVALID:'请求验证已失效，请重试。',PREAUTH_INVALID:'登录验证已失效，请重新提交。',USERNAME_TAKEN:'此用户名已被使用。',RATE_LIMITED:'请求过于频繁，请稍后再试。',REVISION_CONFLICT:'偏好已在其他页面更新，请重新加载后再保存。',INVALID_REQUEST:'请检查输入格式。',INVALID_RESPONSE:'服务响应异常，请稍后重试。',STALE_RESPONSE:'账号已变化，旧请求已停止。',BUSY:'正在保存，请稍候。'};
 return messages[code]??'连接未完成，请稍后重试。';
}
export async function requestJson<T>(path:string,schema:z.ZodType<T>,options:{method?:'GET'|'POST'|'PATCH';body?:unknown;identity?:RequestIdentity;preauth?:string;signal?:AbortSignal;fetcher?:typeof fetch}={}):Promise<T>{
 if(!/^\/studio-api\/(?:auth\/(?:bootstrap|register|login|logout)|session|me\/(?:document|onboarding))$/.test(path))throw new ApiError(0,'INVALID_REQUEST');
 const method=options.method??'GET',headers:Record<string,string>={Accept:'application/json'};
 if(options.identity){headers['X-Workspace-Context']=options.identity.contextId;if(method!=='GET')headers['X-CSRF-Token']=options.identity.csrfToken;}
 if(options.preauth)headers['X-CSRF-Token']=options.preauth;
 if(options.body!==undefined)headers['Content-Type']='application/json';
 let response:Response;
 try{response=await (options.fetcher??fetch)(path,{method,headers,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),body:options.body===undefined?undefined:JSON.stringify(options.body)});}catch{throw new ApiError(0,'NETWORK_ERROR');}
 if(response.status===204&&response.ok)return schema.parse(undefined);
 let value:unknown;try{const text=await response.text();if(text.length>65536)throw new Error();value=JSON.parse(text);}catch{throw new ApiError(response.status,'INVALID_RESPONSE');}
 if(!response.ok){const parsed=z.strictObject({code:z.string()}).safeParse(value);throw new ApiError(response.status,parsed.success&&codes.has(parsed.data.code)?parsed.data.code:'INTERNAL_ERROR');}
 const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(response.status,'INVALID_RESPONSE');return parsed.data;
}
