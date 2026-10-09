import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,rename,rm,stat} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {Transform,type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {detectMediaMime} from '../../../src/features/assets/media-probe.js';
import {HttpError} from '../errors.js';
export type AssetStorageOptions={root:string;maxAssetBytes:number;userQuotaBytes:number;maxThumbnailBytes:number};
export type FileManifest={bytes:number;sha256:string;mimeType:string};
export function validateStorageOptions(options:AssetStorageOptions){
 if(!isAbsolute(options.root)||![options.maxAssetBytes,options.userQuotaBytes,options.maxThumbnailBytes].every(n=>Number.isSafeInteger(n)&&n>0)||options.maxThumbnailBytes>options.maxAssetBytes||options.userQuotaBytes<options.maxAssetBytes)throw new Error('Explicit private storage path and capacity required');
}
function location(options:AssetStorageOptions,userId:string,id:string,variant:'original'|'thumbnail',manifest?:FileManifest){
 if(!/^[a-f0-9-]{36}$/.test(userId)||!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid private storage identity');
 if(variant==='thumbnail'&&!/^[a-f0-9]{64}$/.test(manifest?.sha256??''))throw new Error('Invalid thumbnail identity');
 return join(options.root,userId,id,variant==='thumbnail'?variant+'-'+manifest!.sha256:variant);
}
export async function writeAssetFile(options:AssetStorageOptions,userId:string,id:string,variant:'original'|'thumbnail',manifest:FileManifest,input:Readable){
 const final=location(options,userId,id,variant,manifest),temporary=final+'.upload-'+randomUUID();
 await mkdir(join(options.root,userId,id),{recursive:true,mode:0o700});
 let size=0;const hash=createHash('sha256');let prefix=Buffer.alloc(0);
 const validate=new Transform({transform(chunk:Buffer,_encoding,callback){size+=chunk.length;if(size>manifest.bytes)return callback(new HttpError(400,'UPLOAD_INVALID'));hash.update(chunk);if(prefix.length<128)prefix=Buffer.concat([prefix,chunk.subarray(0,128-prefix.length)]);callback(null,chunk);}});
 try{
  await pipeline(input,validate,createWriteStream(temporary,{flags:'wx',mode:0o600,flush:true}));
  if(size!==manifest.bytes||hash.digest('hex')!==manifest.sha256||detectMediaMime(prefix)!==manifest.mimeType)throw new HttpError(400,'UPLOAD_INVALID');
  await rename(temporary,final);
 }finally{await rm(temporary,{force:true});}
}
export async function verifyAssetFile(options:AssetStorageOptions,userId:string,id:string,variant:'original'|'thumbnail',manifest:FileManifest){
 const file=location(options,userId,id,variant,manifest);let size:number;
 try{size=(await stat(file)).size;}catch{throw new HttpError(409,'UPLOAD_INCOMPLETE');}
 if(size!==manifest.bytes)throw new HttpError(409,'UPLOAD_INCOMPLETE');
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
 if(hash.digest('hex')!==manifest.sha256)throw new HttpError(409,'UPLOAD_INCOMPLETE');
 return file;
}
export async function assetFile(options:AssetStorageOptions,userId:string,id:string,variant:'original'|'thumbnail',manifest:FileManifest){
 const file=location(options,userId,id,variant,manifest);try{const meta=await stat(file);if(!meta.isFile()||meta.size!==manifest.bytes)throw new Error();return file;}catch{throw new HttpError(503,'MEDIA_UNAVAILABLE');}
}
export async function copyThumbnail(options:AssetStorageOptions,userId:string,sourceId:string,targetId:string,manifest:FileManifest){
 const source=await verifyAssetFile(options,userId,sourceId,'thumbnail',manifest);
 await writeAssetFile(options,userId,targetId,'thumbnail',manifest,createReadStream(source));
}
export async function removeThumbnail(options:AssetStorageOptions,userId:string,id:string,manifest:FileManifest){await rm(location(options,userId,id,'thumbnail',manifest),{force:true});}
export async function removePendingFiles(options:AssetStorageOptions,userId:string,id:string){
 const file=location(options,userId,id,'original');const directory=file.slice(0,-'original'.length);
 await rm(directory,{recursive:true,force:true});
}
