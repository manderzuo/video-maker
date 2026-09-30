import {useEffect} from 'react';
import {listLocalTasks} from './task-filters';
import {getActiveCore,subscribeActiveCore} from '../../adapters/core/current-connection';
import {hasSessionCredential} from '../../security/credential-session';
import {startVideoPolling} from '../../application/runs/poll-video';
// Page-scoped ownership; the canvas already owns its own tracking loop. Filters
// and local archive affect presentation, never this original-binding scan.
export function TaskTracking(){
 useEffect(()=>{
  let alive=true,busy=false;const handles=new Map<string,{stop:()=>void}>();
  function stopAll(){for(const handle of handles.values())handle.stop();handles.clear();}
  async function reconcile(){if(!alive||busy)return;busy=true;try{
   const rows=await listLocalTasks({includeArchived:true}),active=getActiveCore();if(!alive)return;
   const eligible=active&&active.capability.verification!=='unknown'&&hasSessionCredential(active.client.binding.id)?rows.filter(i=>i.kind==='video'&&!!i.taskId&&['accepted','running'].includes(i.executionState)&&!['paused_by_user','auth_required'].includes(i.queryState)&&i.connectionId===active.client.profile.id&&i.authBindingId===active.client.binding.id&&i.originSnapshot===active.client.profile.originSnapshot):[];
   for(const [id,handle] of handles)if(!eligible.some(i=>i.id===id)){handle.stop();handles.delete(id);}
   for(const item of eligible)if(active&&!handles.has(item.id))handles.set(item.id,startVideoPolling(item.id,active));
  }catch{/* Local records remain untouched when display reads fail. */}finally{busy=false;}}
  const unsubscribe=subscribeActiveCore(()=>{stopAll();void reconcile();});void reconcile();const timer=setInterval(()=>void reconcile(),1500);
  return()=>{alive=false;clearInterval(timer);unsubscribe();stopAll();};
 },[]);return null;
}
