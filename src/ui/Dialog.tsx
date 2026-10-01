import {useId,useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Button} from './Button';
import {dialogContracts} from './dialog-contracts';
export function Dialog({open,title,onClose,children,footer,dismissible=true,width=640}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;dismissible?:boolean;width?:number}){
 const ref=useRef<HTMLDialogElement>(null),previous=useRef<HTMLElement|null>(null),titleId=useId();
 useLayoutEffect(()=>{
  const dialog=ref.current!;
  if(open&&!dialog.open){previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.showModal();}
  if(!open&&dialog.open){dialog.close();previous.current?.focus();}
  return()=>{if(dialog.open){dialog.close();previous.current?.focus();}};
 },[open]);
 return createPortal(<dialog data-dialog-id={dialogContracts[title]} ref={ref} className={'dialog dialog-'+width} aria-labelledby={titleId} aria-modal="true" onCancel={event=>{event.preventDefault();event.stopPropagation();if(dismissible)onClose();}} onKeyDown={event=>{
  if(event.key!=='Tab')return;
  event.stopPropagation();
  const stops=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0);
  const first=stops[0],last=stops.at(-1);
  if(!first){event.preventDefault();event.currentTarget.focus();return;}
  if(event.shiftKey&&(document.activeElement===first||!event.currentTarget.contains(document.activeElement))){event.preventDefault();last!.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!event.currentTarget.contains(document.activeElement))){event.preventDefault();first.focus();}
 }}>
  <header className="dialog-header"><h2 id={titleId}>{title}</h2><Button data-interaction-id="G-08" aria-label={'关闭'+title} disabled={!dismissible} disabledReason={!dismissible?'操作处理中，请稍候':undefined} onClick={onClose}>×</Button></header>
  <div className="dialog-body">{open?children:null}</div>{open&&footer?<footer className="dialog-footer">{footer}</footer>:null}
 </dialog>,document.body);
}
