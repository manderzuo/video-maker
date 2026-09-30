export type MediaMetadata={mimeType:string;bytes:number;width?:number;height?:number;durationSeconds?:number};
const ascii=(bytes:Uint8Array,start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
export function detectMediaMime(bytes:Uint8Array):string|undefined{
 if(bytes.length>=24&&bytes.slice(0,8).every((b,i)=>b===[137,80,78,71,13,10,26,10][i]))return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(['GIF87a','GIF89a'].includes(ascii(bytes,0,6)))return 'image/gif';
 if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,12)==='WEBP')return 'image/webp';
 if(bytes.length>=12&&ascii(bytes,4,8)==='ftyp')return 'video/mp4';
 if(bytes.slice(0,4).every((b,i)=>b===[26,69,223,163][i])&&bytes.length>=4)return 'video/webm';
 if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,12)==='WAVE')return 'audio/wav';
 if(ascii(bytes,0,4)==='OggS')return 'audio/ogg';
 if(ascii(bytes,0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224))return 'audio/mpeg';
 return undefined;
}
export async function probeMedia(blob:Blob):Promise<MediaMetadata>{
 const bytes=new Uint8Array(await blob.slice(0,128).arrayBuffer()),mimeType=detectMediaMime(bytes);
 if(!mimeType)throw new Error('media_invalid_signature');
 const result:MediaMetadata={mimeType,bytes:blob.size};
 if(mimeType==='image/png'){const view=new DataView(bytes.buffer);const width=view.getUint32(16),height=view.getUint32(20);if(!width||!height)throw new Error('media_invalid_dimensions');Object.assign(result,{width,height});}
 if(mimeType==='image/gif'&&bytes.length>=10){const view=new DataView(bytes.buffer);Object.assign(result,{width:view.getUint16(6,true),height:view.getUint16(8,true)});}
 if(typeof document==='undefined')return result;
 const url=URL.createObjectURL(blob);
 try{
  if(mimeType.startsWith('image/')){
   const image=new Image();
   await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('media_decode_failed'));image.src=url;});
   result.width=image.naturalWidth;result.height=image.naturalHeight;
  }else{
   const element=document.createElement(mimeType.startsWith('video/')?'video':'audio');element.preload='metadata';element.muted=true;
   try{await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(resolve,5000);
    element.onloadedmetadata=()=>{clearTimeout(timer);if(Number.isFinite(element.duration)&&element.duration>=0)result.durationSeconds=element.duration;if(element instanceof HTMLVideoElement&&element.videoWidth>0){result.width=element.videoWidth;result.height=element.videoHeight;}resolve();};
    element.onerror=()=>{clearTimeout(timer);reject(new Error('media_decode_failed'));};element.src=url;
   });}finally{element.removeAttribute('src');element.load();}
  }
  return result;
 }finally{URL.revokeObjectURL(url);}
}
