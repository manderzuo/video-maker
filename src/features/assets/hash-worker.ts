export async function digestBlob(blob:Blob):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function hashBlob(blob:Blob):Promise<string>{
 if(typeof Worker==='undefined')return digestBlob(blob);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./hash-worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{hash?:string;error?:string}>)=>{worker.terminate();if(event.data.hash)resolve(event.data.hash);else reject(new Error(event.data.error??'hash_failed'));};
  worker.onerror=()=>{worker.terminate();reject(new Error('hash_worker_failed'));};
  worker.postMessage(blob);
 });
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
 self.onmessage=async(event:MessageEvent<Blob>)=>{try{self.postMessage({hash:await digestBlob(event.data)});}catch{self.postMessage({error:'hash_failed'});}};
}
