import {useRef,type ReactNode} from 'react';
import {Icon} from './Icon';
export function ToolbarDisclosure({label,children,interactionId}:{label:string;children:ReactNode;interactionId:string}){
 const ref=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null);
 function close(returnFocus=false){if(ref.current)ref.current.open=false;if(returnFocus)trigger.current?.focus({preventScroll:true});}
 return <details ref={ref} className="toolbar-disclosure" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close();}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}}}><summary ref={trigger} data-interaction-id={interactionId}>{label}<Icon name="chevron-down"/></summary><div className="toolbar-menu" onClick={event=>{if((event.target as HTMLElement).closest('button:not(:disabled),a[href]'))close(true);}}>{children}</div></details>;
}
