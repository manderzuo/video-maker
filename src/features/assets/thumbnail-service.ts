export async function createThumbnail(blob:Blob,mimeType:string):Promise<Blob|undefined>{
 if(!mimeType.startsWith('image/')||typeof createImageBitmap==='undefined'||typeof OffscreenCanvas==='undefined')return undefined;
 const bitmap=await createImageBitmap(blob);
 try{
  const factor=Math.min(1,256/Math.max(bitmap.width,bitmap.height)),canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*factor)),Math.max(1,Math.round(bitmap.height*factor)));
  const context=canvas.getContext('2d');if(!context)return undefined;
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return await canvas.convertToBlob({type:'image/webp',quality:.8});
 }finally{bitmap.close();}
}
