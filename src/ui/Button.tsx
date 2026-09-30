import {useId,useRef,useState,type ButtonHTMLAttributes,type MouseEvent} from 'react';
type Props=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'> & {variant?:'primary'|'secondary'|'danger';busy?:boolean;disabledReason?:string;onClick?:(event:MouseEvent<HTMLButtonElement>)=>void|Promise<void>};
export function Button({variant='secondary',busy=false,disabled=false,disabledReason,onClick,children,...props}:Props){
 const [pending,setPending]=useState(false),inFlight=useRef(false),reasonId=useId(),blocked=disabled||busy||pending;
 return <span className="button-group"><button {...props} className={'button '+variant+' '+(props.className??'')} disabled={blocked} aria-busy={busy||pending} aria-describedby={blocked&&disabledReason?reasonId:props['aria-describedby']} onClick={async event=>{
  if(inFlight.current||blocked)return;inFlight.current=true;
  try{const result=onClick?.(event);if(result){setPending(true);await result;}}finally{inFlight.current=false;setPending(false);}
 }}>{busy||pending?<span aria-hidden="true">◌ </span>:null}{children}</button>{blocked&&disabledReason?<small id={reasonId} className="disabled-reason">{disabledReason}</small>:null}</span>;
}
