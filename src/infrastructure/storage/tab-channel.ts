export type TabMessage={type:'lease-changed'|'project-committed';projectId:string;epoch:number;revision:number};
function validMessage(value:unknown):value is TabMessage{
 if(!value||typeof value!=='object')return false;const m=value as Record<string,unknown>;
 return Object.keys(m).every(k=>['type','projectId','epoch','revision'].includes(k))&&['lease-changed','project-committed'].includes(String(m.type))&&typeof m.projectId==='string'&&typeof m.epoch==='number'&&Number.isSafeInteger(m.epoch)&&m.epoch>0&&typeof m.revision==='number'&&Number.isSafeInteger(m.revision)&&m.revision>=0;
}
export class TabChannel{
 private channel:BroadcastChannel|null;
 private listeners=new Set<(message:TabMessage)=>void>();
 constructor(){this.channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('aiwork-studio:coordination:v1');if(this.channel)this.channel.onmessage=event=>{if(validMessage(event.data))for(const listener of this.listeners)listener(event.data);};}
 publish(message:TabMessage){if(!validMessage(message))throw new Error('tab_message_invalid');this.channel?.postMessage(message);}
 subscribe(listener:(message:TabMessage)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 close(){this.channel?.close();this.channel=null;this.listeners.clear();}
}
