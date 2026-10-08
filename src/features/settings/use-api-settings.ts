import {ApiSettingsError,apiSettingsMessage,normalizeApiBase,type ApiSettingsIdentity,type ApiSettingsClient,type ModelChannel,type ModelConfig,type ModelProbe} from './api-settings-client';
export type ApiSettingsBridge={getIdentity:()=>ApiSettingsIdentity|null;subscribe:(listener:()=>void)=>()=>void;refresh:()=>Promise<void>};
export type ApiDraft={apiBase:string;model:string;apiKey:string;saved:ModelConfig|null;pending:'test'|'save'|null;result:ModelProbe|null;error:string;message:string;conflict:boolean;draftRevision:number};
export type ApiSettingsState={status:'loading'|'ready'|'error'|'inactive';video:ApiDraft;text:ApiDraft;error:string};
const blank=():ApiDraft=>({apiBase:'',model:'',apiKey:'',saved:null,pending:null,result:null,error:'',message:'',conflict:false,draftRevision:0});
export function createApiSettingsStore(bridge:ApiSettingsBridge,client:ApiSettingsClient){
 let state:ApiSettingsState={status:'inactive',video:blank(),text:blank(),error:''},identity:ApiSettingsIdentity|null=null,epoch=0,started=false,disposed=false;
 let unsubscribe:()=>void=()=>{};const listeners=new Set<()=>void>(),controllers=new Set<AbortController>();const probes:Partial<Record<ModelChannel,AbortController>>={};
 const publish=(next:ApiSettingsState)=>{state=next;for(const listener of listeners)listener();};
 const same=(next:ApiSettingsIdentity|null)=>next?.userId===identity?.userId&&next?.contextId===identity?.contextId&&next?.csrfToken===identity?.csrfToken;
 const valid=(generation:number)=>!disposed&&generation===epoch&&identity!==null&&same(bridge.getIdentity());
 const update=(channel:ModelChannel,patch:Partial<ApiDraft>)=>publish({...state,[channel]:{...state[channel],...patch}});
 function clear(status:ApiSettingsState['status']='inactive'){
  epoch++;for(const controller of controllers)controller.abort();controllers.clear();delete probes.text;delete probes.video;publish({status,video:blank(),text:blank(),error:''});
 }
 function identityFailure(error:unknown){
  if(error instanceof ApiSettingsError&&(error.status===401||['SESSION_CHANGED','CSRF_INVALID'].includes(error.code))){clear();identity=null;void bridge.refresh();return true;}return false;
 }
 async function load(preserveDraft=false){
  const captured=bridge.getIdentity(),preserve=preserveDraft&&same(captured)&&captured!==null;identity=captured;
  if(preserve){epoch++;for(const controller of controllers)controller.abort();controllers.clear();delete probes.text;delete probes.video;publish({...state,status:'loading',error:'',text:{...state.text,pending:null},video:{...state.video,pending:null}});}else clear(captured?'loading':'inactive');
  if(!captured||disposed)return;
  const generation=epoch,controller=new AbortController();controllers.add(controller);
  try{
   const configs=await client.list(captured,controller.signal);if(!valid(generation))return;
   const drafts={video:blank(),text:blank()};for(const config of configs)drafts[config.channel]={...blank(),apiBase:config.apiBase,model:config.model,saved:config};publish({status:'ready',...drafts,error:''});
  }catch(error){if(valid(generation)&&!identityFailure(error))publish({...state,status:'error',error:apiSettingsMessage(error)});}
  finally{controllers.delete(controller);}
 }
 function connectionInput(channel:ModelChannel){
  const draft=state[channel],apiBase=normalizeApiBase(draft.apiBase),apiKey=draft.apiKey;
  if(apiKey){if(apiKey.length>4096||/[\u0000-\u0020\u007f-\u009f*\u2022]/.test(apiKey))throw new ApiSettingsError(0,'INVALID_API_KEY');return {apiBase,apiKey};}
  if(!draft.saved?.hasKey||draft.saved.apiBase!==apiBase)throw new ApiSettingsError(0,'API_KEY_REQUIRED');return {apiBase};
 }
 async function operate(channel:ModelChannel,operation:'test'|'save'){
  if(state.status!=='ready'||state[channel].pending||!identity)return;if(operation==='save'&&state[channel].conflict)return;
  const captured={...identity},generation=epoch,draft=state[channel],revision=draft.draftRevision,controller=new AbortController();
  let input:ReturnType<typeof connectionInput>;
  try{input=connectionInput(channel);if(operation==='save'&&(!draft.model.trim()||draft.model.trim().length>256||/[\u0000-\u001f\u007f-\u009f]/.test(draft.model)))throw new ApiSettingsError(0,'MODEL_REQUIRED');}
  catch(error){update(channel,{error:apiSettingsMessage(error),message:''});return;}
  controllers.add(controller);if(operation==='test')probes[channel]=controller;update(channel,{pending:operation,error:'',message:'',...(operation==='test'?{result:null}:{})});
  try{
   if(operation==='test'){
    const requestId=crypto.randomUUID(),result=await client.test(channel,{...input,requestId},captured,controller.signal);
    if(valid(generation)&&state[channel].draftRevision===revision&&probes[channel]===controller)update(channel,{result});
   }else{
    const saved=await client.save(channel,{...input,model:draft.model.trim(),expectedRevision:draft.saved?.revision??null},captured,controller.signal);
    if(valid(generation)){const unchanged=state[channel].draftRevision===revision;update(channel,{saved,conflict:false,message:unchanged?'已保存到当前账号。':'提交的配置已保存；新的输入尚未保存。',...(unchanged?{apiBase:saved.apiBase,model:saved.model,apiKey:''}:{})});}
   }
  }catch(error){if(valid(generation)&&!identityFailure(error)&&(operation==='save'||state[channel].draftRevision===revision))update(channel,{error:apiSettingsMessage(error),conflict:error instanceof ApiSettingsError&&error.code==='REVISION_CONFLICT'});}
  finally{controllers.delete(controller);const ownsPending=operation==='save'||probes[channel]===controller;if(probes[channel]===controller)delete probes[channel];if(ownsPending&&valid(generation)&&state[channel].pending===operation)update(channel,{pending:null});}
 }
 return {
  getState:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  start(){if(started||disposed)return;started=true;unsubscribe=bridge.subscribe(()=>{if(!same(bridge.getIdentity()))void load();});void load();},
  dispose(){disposed=true;unsubscribe();identity=null;clear();},
  edit(channel:ModelChannel,field:'apiBase'|'model'|'apiKey',value:string){
   if(state.status!=='ready')return;const draft=state[channel];if(draft[field]===value)return;
   probes[channel]?.abort();delete probes[channel];update(channel,{[field]:value,draftRevision:draft.draftRevision+1,error:'',message:'',...(draft.pending==='test'?{pending:null}:{}),...(field!=='model'?{result:null}:{})});
  },
  save:(channel:ModelChannel)=>operate(channel,'save'),test:(channel:ModelChannel)=>operate(channel,'test'),reload:()=>load(true),
 };
}
export type ApiSettingsStore=ReturnType<typeof createApiSettingsStore>;
