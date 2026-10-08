import {z} from 'zod';
export type ModelChannel='video'|'text';
export type ApiSettingsIdentity={userId:string;contextId:string;csrfToken:string};
export type ModelConfig={channel:ModelChannel;apiBase:string;model:string;revision:number;hasKey:boolean};
export type ModelProbe={requestId:string;connection:'verified'|'unknown'|'failed';catalogStatus:'ready'|'empty'|'unavailable'|'failed';models:string[];message:string};
export type ConfigInput={apiBase:string;model:string;apiKey?:string;expectedRevision:number|null};
export type ProbeInput={apiBase:string;apiKey?:string;requestId:string};
export class ApiSettingsError extends Error {constructor(public readonly status:number,public readonly code:string){super(code);}}
const name=z.string().min(1).max(256).refine(value=>value.trim()===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value));
const configSchema=z.strictObject({channel:z.enum(['video','text']),apiBase:z.string().min(1).max(2048),model:name,revision:z.number().int().min(1).max(2147483647),hasKey:z.boolean()});
const listSchema=z.strictObject({configs:z.array(configSchema).max(2).refine(configs=>new Set(configs.map(config=>config.channel)).size===configs.length)});
const probeSchema=z.strictObject({requestId:z.string().min(1).max(128),connection:z.enum(['verified','unknown','failed']),catalogStatus:z.enum(['ready','empty','unavailable','failed']),models:z.array(name).max(20000),message:z.string().max(128)});
const key=z.string().min(1).max(4096).refine(value=>!/[\u0000-\u0020\u007f-\u009f*\u2022]/.test(value));
const base=z.string().min(1).max(2048);
const saveSchema=z.strictObject({apiBase:base,model:name,apiKey:key.optional(),expectedRevision:z.number().int().min(0).max(2147483646).nullable()});
const testSchema=z.strictObject({apiBase:base,apiKey:key.optional(),requestId:z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/)});
const errorCodes=new Set(['AUTH_REQUIRED','SESSION_CHANGED','CSRF_INVALID','INVALID_REQUEST','INVALID_API_BASE','INVALID_API_KEY','API_KEY_REQUIRED','OUTBOUND_BLOCKED','REVISION_CONFLICT','RATE_LIMITED','UPSTREAM_FAILED','UPSTREAM_TIMEOUT','INTERNAL_ERROR']);
export function apiSettingsMessage(error:unknown):string{
 const code=error instanceof ApiSettingsError?error.code:'';
 const messages:Record<string,string>={AUTH_REQUIRED:'登录已过期，请重新登录。',SESSION_CHANGED:'账号已变化，请重新确认登录状态。',CSRF_INVALID:'登录验证已失效，请重新登录。',INVALID_REQUEST:'请检查地址、模型名称和密钥格式。',INVALID_API_BASE:'请输入有效的 HTTPS API 地址。',INVALID_API_KEY:'请输入有效密钥，不要输入星号或占位符。',API_KEY_REQUIRED:'该地址需要填写 API 密钥。',MODEL_REQUIRED:'请输入模型名称，可手动填写目录以外的名称。',REVISION_CONFLICT:'配置已在其他页面更新，输入已保留。请重新加载配置后再保存。',RATE_LIMITED:'测试过于频繁，请稍后重试。',OUTBOUND_BLOCKED:'该 API 地址无法连接，请检查公开 HTTPS 地址。',INVALID_RESPONSE:'服务响应异常，请稍后重试。',NETWORK_ERROR:'连接失败，输入已保留，请稍后重试。'};
 return messages[code]??'操作未完成，输入已保留，请稍后重试。';
}
export function normalizeApiBase(value:string):string{
 try{
  const input=value.trim();if(!input||input.length>2048||/[\u0000-\u0020\u007f?#\\]/.test(input)||/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)|%2f|%5c/i.test(input))throw new Error();
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||!url.hostname||/\/v1(?:\/v1)+$/.test(input.replace(/\/$/,'')))throw new Error();
  url.pathname=url.pathname.replace(/\/v1\/chat\/completions\/?$/,'').replace(/\/$/,'').replace(/\/v1$/,'');return url.href.replace(/\/$/,'');
 }catch{throw new ApiSettingsError(0,'INVALID_API_BASE');}
}
export function createApiSettingsClient(fetcher:typeof fetch=fetch){
 async function request<T>(path:string,schema:z.ZodType<T>,identity:ApiSettingsIdentity,method:'GET'|'PATCH'|'POST',body?:unknown,signal?:AbortSignal):Promise<T>{
  const headers:Record<string,string>={Accept:'application/json','X-Workspace-Context':identity.contextId};
  if(method!=='GET')headers['X-CSRF-Token']=identity.csrfToken;if(body!==undefined)headers['Content-Type']='application/json';
  let response:Response;
  try{response=await fetcher(path,{method,headers,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new ApiSettingsError(0,'NETWORK_ERROR');}
  let data:unknown;try{const text=await response.text();if(text.length>8*1024*1024)throw new Error();data=JSON.parse(text);}catch{throw new ApiSettingsError(response.status,'INVALID_RESPONSE');}
  if(!response.ok){const error=z.strictObject({code:z.string()}).safeParse(data);throw new ApiSettingsError(response.status,error.success&&errorCodes.has(error.data.code)?error.data.code:'INTERNAL_ERROR');}
  const parsed=schema.safeParse(data);if(!parsed.success)throw new ApiSettingsError(response.status,'INVALID_RESPONSE');return parsed.data;
 }
 const channelPath=(channel:ModelChannel)=>{if(!['text','video'].includes(channel))throw new ApiSettingsError(0,'INVALID_REQUEST');return '/studio-api/me/model-configs/'+channel;};
 return {
  async list(identity:ApiSettingsIdentity,signal?:AbortSignal):Promise<ModelConfig[]>{return (await request('/studio-api/me/model-configs',listSchema,identity,'GET',undefined,signal)).configs;},
  async save(channel:ModelChannel,input:ConfigInput,identity:ApiSettingsIdentity,signal?:AbortSignal):Promise<ModelConfig>{
   const body=saveSchema.safeParse(input);if(!body.success)throw new ApiSettingsError(0,'INVALID_REQUEST');const config=await request(channelPath(channel),configSchema,identity,'PATCH',body.data,signal);if(config.channel!==channel)throw new ApiSettingsError(0,'INVALID_RESPONSE');return config;
  },
  async test(channel:ModelChannel,input:ProbeInput,identity:ApiSettingsIdentity,signal?:AbortSignal):Promise<ModelProbe>{
   const body=testSchema.safeParse(input);if(!body.success)throw new ApiSettingsError(0,'INVALID_REQUEST');const result=await request(channelPath(channel)+'/test',probeSchema,identity,'POST',body.data,signal);if(result.requestId!==input.requestId)throw new ApiSettingsError(0,'INVALID_RESPONSE');return result;
  },
 };
}
export type ApiSettingsClient=ReturnType<typeof createApiSettingsClient>;
