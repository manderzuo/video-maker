import {useEffect,useRef} from 'react';
import {addNavigationGuard} from '../../app/routes';
export function useCloudDraftGuard(dirty:boolean,onBlocked:()=>void){
 const changed=useRef(dirty),blocked=useRef(onBlocked);changed.current=dirty;blocked.current=onBlocked;
 useEffect(()=>{
  const remove=addNavigationGuard(()=>{if(!changed.current)return true;blocked.current();return false;});
  const unload=(event:BeforeUnloadEvent)=>{if(changed.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',unload);return()=>{remove();window.removeEventListener('beforeunload',unload);};
 },[]);
}
