const listeners=new Set<()=>void>();
export const subscribeAgentChanges=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function emitAgentChanges(){for(const listener of listeners)listener();}
