import {useSyncExternalStore,type AnchorHTMLAttributes} from 'react';
let navigationGuard:((path:string)=>boolean)|undefined;
let currentPath=location.pathname+location.search;
window.addEventListener('popstate',event=>{const next=location.pathname+location.search;if(next!==currentPath&&navigationGuard&&!navigationGuard(next)){history.pushState(null,'',currentPath);event.stopImmediatePropagation();return;}currentPath=next;},{capture:true});
export function setNavigationGuard(guard:((path:string)=>boolean)|undefined){navigationGuard=guard;}
export function addNavigationGuard(guard:(path:string)=>boolean){const previous=navigationGuard,composed=(path:string)=>guard(path)&&(!previous||previous(path));navigationGuard=composed;return()=>{if(navigationGuard===composed)navigationGuard=previous;};}
export function navigate(path:string){if(!path.startsWith('/')||path.startsWith('//'))throw new Error('local_navigation_required');if(navigationGuard&&!navigationGuard(path))return;currentPath=path;history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));}
const subscribe=(callback:()=>void)=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback);};
export const useRoute=()=>useSyncExternalStore(subscribe,()=>location.pathname+location.search);
export function LocalLink({href='/',onClick,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
 return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(href);}}}/>;
}
export const routeTitle=(pathname:string)=>{
 if(pathname==='/welcome')return '开始你的创作项目';
 if(pathname==='/projects')return '项目';
 if(pathname==='/projects/packages')return '项目导入导出';
 if(pathname==='/assets')return '素材库';
 if(pathname==='/prompt-generator')return '提示词生成';
 if(pathname==='/prompt-generator/history')return '提示词生成历史';
 if(pathname==='/prompts')return '提示词库';
 if(pathname==='/tasks')return '任务中心';
 if(pathname==='/activity')return '活动记录';
 if(pathname==='/help')return '帮助';
 if(pathname==='/trash')return '回收站';
 if(pathname.startsWith('/settings/'))return '设置';
 if(/^\/projects\/[^/]+\/(canvas|results|compare|agent)$/.test(pathname))return '项目工作区';
 return undefined;
};
