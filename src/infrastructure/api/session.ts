import {z} from 'zod';
import {ApiError,apiMessage,requestJson} from './client';
import {userDocumentSchema,type UserDocumentView,type DocumentPatch} from './user-document';
import {resetPreferences,adoptUserPreferences} from '../../features/settings/preferences-store';
const token=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const sessionSchema=z.strictObject({user:z.strictObject({id:z.string().uuid(),username:z.string().min(3).max(64)}),contextId:token,csrfToken:token,onboardingCompletedAt:z.string().datetime().nullable()});
export const bootstrapSchema=z.strictObject({csrfToken:token,expiresAt:z.string().datetime()});
export type UserSessionView=z.infer<typeof sessionSchema>;
export type AuthBootstrapView=z.infer<typeof bootstrapSchema>;
export type AuthState={status:'checking'}|{status:'anonymous';message?:string}|{status:'error';message:string}|{status:'authenticated';session:UserSessionView;document:UserDocumentView;busy:boolean};
export function createSessionStore(fetcher:typeof fetch=fetch){
 let state:AuthState={status:'checking'},epoch=0,checkPending=false;
 const listeners=new Set<()=>void>(),controllers=new Set<AbortController>();let channel:BroadcastChannel|undefined;
 const publish=(next:AuthState)=>{state=next;for(const listener of listeners)listener();};
 const invalidate=(next:AuthState={status:'checking'})=>{epoch++;for(const controller of controllers)controller.abort();controllers.clear();resetPreferences();publish(next);return epoch;};
 const broadcast=()=>{if(channel)channel.postMessage('changed');else try{localStorage.setItem('aiwork-studio:identity-change',crypto.randomUUID());}catch{/* Server context validation remains authoritative. */}};
 async function request<T>(generation:number,path:string,schema:z.ZodType<T>,options:Parameters<typeof requestJson<T>>[2]={}){
  if(generation!==epoch)throw new ApiError(0,'STALE_RESPONSE');const controller=new AbortController();controllers.add(controller);
  try{const result=await requestJson(path,schema,{...options,fetcher,signal:controller.signal});if(generation!==epoch)throw new ApiError(0,'STALE_RESPONSE');return result;}
  catch(error){if(generation!==epoch)throw new ApiError(0,'STALE_RESPONSE');if(options.identity&&(error instanceof ApiError)&&(error.status===401||error.code==='SESSION_CHANGED'))invalidate({status:'anonymous',message:'登录状态已变化，请重新登录。'});throw error;}
  finally{controllers.delete(controller);}
 }
 function accept(session:UserSessionView,document:UserDocumentView,busy=false){adoptUserPreferences(document.preferences,document.lastVisitedPage);publish({status:'authenticated',session:{...session,onboardingCompletedAt:document.onboardingCompletedAt},document,busy});}
 async function refresh(){
  const generation=invalidate();try{const session=await request(generation,'/studio-api/session',sessionSchema);const document=await request(generation,'/studio-api/me/document',userDocumentSchema,{identity:session});accept(session,document);}
  catch(error){if(generation!==epoch)return;if(error instanceof ApiError&&error.status===401)publish({status:'anonymous'});else publish({status:'error',message:'无法确认登录状态，请重试。'});}
 }
 async function checkSession(){
  if(state.status!=='authenticated'||checkPending)return;checkPending=true;const generation=epoch,contextId=state.session.contextId;
  try{const session=await request(generation,'/studio-api/session',sessionSchema);if(session.contextId!==contextId)await refresh();}
  catch(error){if(generation===epoch){invalidate(error instanceof ApiError&&error.status===401?{status:'anonymous',message:'登录已过期，请重新登录。'}:{status:'error',message:'无法确认登录状态，请重试。'});}}
  finally{checkPending=false;}
 }
 async function authenticate(operation:'register'|'login',credentials:{username:string;password:string},bootstrap:AuthBootstrapView){
  const generation=invalidate();try{const session=await request(generation,'/studio-api/auth/'+operation,sessionSchema,{method:'POST',body:credentials,preauth:bootstrap.csrfToken});const document=await request(generation,'/studio-api/me/document',userDocumentSchema,{identity:session});accept(session,document);broadcast();}
  catch(error){if(generation===epoch)publish({status:'anonymous',message:apiMessage(error)});throw error;}
 }
 async function logout(){
  if(state.status!=='authenticated')return;const identity=state.session,generation=invalidate();
  try{await request(generation,'/studio-api/auth/logout',z.undefined(),{method:'POST',identity});if(generation===epoch)publish({status:'anonymous'});}
  catch(error){if(generation===epoch)publish({status:'error',message:'退出未完成，请检查连接后重试。'});throw error;}
  finally{broadcast();}
 }
 async function saveDocument(patch:DocumentPatch){
  if(state.status!=='authenticated')throw new ApiError(401,'AUTH_REQUIRED');if(state.busy)throw new ApiError(0,'BUSY');const snapshot=state,generation=epoch;publish({...snapshot,busy:true});
  try{const document=await request(generation,'/studio-api/me/document',userDocumentSchema,{method:'PATCH',body:patch,identity:snapshot.session});if(state.status==='authenticated'&&document.revision>=state.document.revision)accept(snapshot.session,document,true);return document;}
  finally{if(generation===epoch&&state.status==='authenticated')publish({...state,busy:false});}
 }
 async function completeOnboarding(){
  if(state.status!=='authenticated')throw new ApiError(401,'AUTH_REQUIRED');if(state.busy)throw new ApiError(0,'BUSY');const snapshot=state,generation=epoch;publish({...snapshot,busy:true});
  try{const document=await request(generation,'/studio-api/me/onboarding',userDocumentSchema.refine(value=>value.onboardingCompletedAt!==null),{method:'PATCH',body:{expectedRevision:snapshot.document.revision,completed:true},identity:snapshot.session});if(state.status==='authenticated'&&document.revision>=state.document.revision)accept(snapshot.session,document,true);return document;}
  finally{if(generation===epoch&&state.status==='authenticated')publish({...state,busy:false});}
 }
 async function reloadDocument(){
  if(state.status!=='authenticated')throw new ApiError(401,'AUTH_REQUIRED');const snapshot=state,generation=epoch;const document=await request(generation,'/studio-api/me/document',userDocumentSchema,{identity:snapshot.session});if(state.status==='authenticated'&&document.revision>=state.document.revision)accept(snapshot.session,document,state.busy);return document;
 }
 const store={getState:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,checkSession,authenticate,logout,saveDocument,completeOnboarding,reloadDocument,bootstrap:(signal?:AbortSignal)=>requestJson('/studio-api/auth/bootstrap',bootstrapSchema,{fetcher,signal}),
  start(){
   if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('aiwork-studio:account-identity-v1');channel.onmessage=event=>{if(event.data==='changed')void refresh();};}
   const storage=(event:StorageEvent)=>{if(event.key==='aiwork-studio:identity-change')void refresh();};
   const visible=()=>{if(document.visibilityState==='visible')void checkSession();};
   window.addEventListener('storage',storage);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>{void checkSession();},30000);void refresh();
   return()=>{clearInterval(timer);window.removeEventListener('storage',storage);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);channel?.close();channel=undefined;invalidate();};
  }};return store;
}
export type SessionStore=ReturnType<typeof createSessionStore>;
export const sessionStore=createSessionStore();
