import {useEffect,type ReactNode} from 'react';
export function Toast({children,kind='success',onClose,undo=false}:{children:ReactNode;kind?:'success'|'error'|'warning';onClose?:()=>void;undo?:boolean}){
 useEffect(()=>{if(kind!=='success'||!onClose)return;const timer=setTimeout(onClose,undo?8000:4000);return()=>clearTimeout(timer);},[kind,onClose,undo]);
 return <div className={'toast '+kind} role={kind==='error'?'alert':'status'}>{kind==='error'?'⚠ ':kind==='warning'?'△ ':'✓ '}{children}</div>;
}
