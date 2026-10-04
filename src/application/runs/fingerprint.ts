export async function fingerprintText(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function createTextSessionId(scope:'prompt'|'agent',connectionId:string,conversationId:string){
 if(!['prompt','agent'].includes(scope)||[connectionId,conversationId].some(id=>typeof id!=='string'||!id||id.length>256))throw Error('text_session_context_invalid');
 return 'studio-'+scope+'-'+await fingerprintText(JSON.stringify([scope,connectionId,conversationId]));
}
