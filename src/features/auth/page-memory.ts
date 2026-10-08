import type {SessionStore} from '../../infrastructure/api/session';
import {allowedAppPathSchema,type UserDocumentView} from '../../infrastructure/api/user-document';
export function createPageMemory(store:SessionStore,contextId:string,onResult:(error:unknown|null)=>void){
 let desired:UserDocumentView['lastVisitedPage']|undefined,running=false,disposed=false,failedRevision:number|undefined;
 const current=()=>{const state=store.getState();return state.status==='authenticated'&&state.session.contextId===contextId?state:undefined;};
 function pump(){
  const state=current();if(disposed||!state){desired=undefined;return;}
  if(running||state.busy||!desired||state.document.lastVisitedPage===desired||failedRevision===state.document.revision)return;
  const path=desired,revision=state.document.revision;running=true;
  void store.saveDocument({expectedRevision:revision,lastVisitedPage:path}).then(()=>{if(!disposed&&current())onResult(null);}).catch(error=>{if(!disposed&&current()){failedRevision=revision;onResult(error);}}).finally(()=>{running=false;pump();});
 }
 const unsubscribe=store.subscribe(pump);
 return {
  visit(path:string){const parsed=allowedAppPathSchema.safeParse(path);const next=parsed.success&&['/settings/appearance','/settings/connections','/help'].includes(path)?parsed.data:undefined;if(next!==desired)failedRevision=undefined;desired=next;pump();},
  dispose(){disposed=true;desired=undefined;unsubscribe();},
 };
}
