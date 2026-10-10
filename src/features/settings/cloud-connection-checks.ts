import type {ApiSettingsIdentity,ModelConfig,ModelProbe} from './api-settings-client';
export type ConnectionCheckState='checking'|'success'|'failed'|'pending';
type Check={signature:string;id:string;state:ConnectionCheckState;checkedAt:number};
export type ConnectionCheckTicket={key:string;signature:string;id:string};
const checks=new Map<string,Check>(),listeners=new Set<()=>void>();
const signature=(config:ModelConfig)=>JSON.stringify([config.apiBase,config.model,config.revision,config.hasKey]);
const key=(identity:ApiSettingsIdentity,config:ModelConfig)=>JSON.stringify([identity.userId,identity.contextId,config.channel]);
const emit=()=>{for(const listener of listeners)listener();};
// Detection facts live only in this tab, bound to account, session and saved revision.
// No credentials are cached. A green light expires after five minutes.
export function readCloudConnectionCheck(identity:ApiSettingsIdentity,config:ModelConfig):ConnectionCheckState{
 const check=checks.get(key(identity,config));return check?.signature===signature(config)&&Date.now()-check.checkedAt<300000?check.state:'pending';
}
export function subscribeCloudConnectionChecks(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function beginCloudConnectionCheck(identity:ApiSettingsIdentity,config:ModelConfig):ConnectionCheckTicket{
 const ticket={key:key(identity,config),signature:signature(config),id:crypto.randomUUID()};checks.delete(ticket.key);checks.set(ticket.key,{...ticket,state:'checking',checkedAt:Date.now()});while(checks.size>32)checks.delete(checks.keys().next().value!);emit();return ticket;
}
export function finishCloudConnectionCheck(ticket:ConnectionCheckTicket,result:Pick<ModelProbe,'connection'>){
 const check=checks.get(ticket.key);if(check?.id!==ticket.id)return;checks.set(ticket.key,{...check,state:result.connection==='verified'?'success':result.connection==='failed'?'failed':'pending',checkedAt:Date.now()});emit();
}
export function cancelCloudConnectionCheck(ticket:ConnectionCheckTicket){const check=checks.get(ticket.key);if(check?.id===ticket.id&&check.state==='checking'){checks.delete(ticket.key);emit();}}
