import {z} from 'zod';
import {createReadStream} from 'node:fs';
import type {Readable} from 'node:stream';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {uploadSchema,assetPatchSchema} from './contracts.js';
import {reserveAsset,listAssets,completeAsset,ownedAsset,manifests,changeAsset,cancelUpload,listAssetReferences} from './repository.js';
import {writeAssetFile,assetFile,validateStorageOptions,type AssetStorageOptions} from './storage.js';
const noQuery=z.strictObject({}),revision=z.strictObject({expectedRevision:z.number().int().nonnegative()}),params=z.strictObject({id:z.uuid()});
const contentQuery=z.strictObject({variant:z.enum(['original','thumbnail']).default('original')});
function assetId(value:unknown){const parsed=params.safeParse(value);if(!parsed.success)throw new HttpError(404,'NOT_FOUND');return parsed.data.id;}
function byteRange(value:string|undefined,size:number){
 if(value===undefined)return undefined;const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2])throw new HttpError(416,'RANGE_INVALID');
 const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||!match[1]&&Number(match[2])<=0)throw new HttpError(416,'RANGE_INVALID');return {start,end};
}
export function registerAssetRoutes(app:FastifyInstance,pool:Pool,options:AssetStorageOptions,now:()=>Date){
 validateStorageOptions(options);
 app.addContentTypeParser('application/octet-stream',(_request,payload,done)=>done(null,payload));
 app.get('/studio-api/assets',async request=>{const query=z.strictObject({trashed:z.enum(['true','false']).optional()}).parse(request.query);return listAssets(pool,requestAuthContext(request),query.trashed==='true');});
 app.post('/studio-api/assets',async(request,reply)=>{noQuery.parse(request.query);const result=await reserveAsset(pool,requestAuthContext(request),uploadSchema.parse(request.body),options,now());return reply.code(result.duplicate?200:201).send(result.value);});
 app.get('/studio-api/assets/:id',async request=>{noQuery.parse(request.query);const row=await ownedAsset(pool,requestAuthContext(request),assetId(request.params));if(row.state!=='complete')throw new HttpError(404,'NOT_FOUND');return manifests(row).asset;});
 app.get('/studio-api/assets/:id/files',async request=>{noQuery.parse(request.query);const row=await ownedAsset(pool,requestAuthContext(request),assetId(request.params));if(row.state!=='complete')throw new HttpError(404,'NOT_FOUND');const {asset,thumbnail}=manifests(row);return {asset,...(thumbnail?{thumbnail}:{})};});
 app.get('/studio-api/assets/:id/references',async request=>{noQuery.parse(request.query);return listAssetReferences(pool,requestAuthContext(request),assetId(request.params));});
 app.put('/studio-api/assets/:id/content',{bodyLimit:options.maxAssetBytes},async(request,reply)=>{
  const context=requestAuthContext(request),id=assetId(request.params),query=contentQuery.parse(request.query);
  if(request.headers['content-type']!=='application/octet-stream')throw new HttpError(400,'INVALID_REQUEST');
  await transaction(pool,async client=>{const row=await ownedAsset(client,context,id,true);if(row.state!=='pending')throw new HttpError(409,'ASSET_ALREADY_COMPLETE');const expected=manifests(row)[query.variant];if(!expected)throw new HttpError(400,'INVALID_REQUEST');await writeAssetFile(options,context.userId,id,query.variant,expected,request.body as Readable);});
  return reply.code(204).send();
 });
 app.post('/studio-api/assets/:id/complete',async request=>{noQuery.parse(request.query);noQuery.parse(request.body);return completeAsset(pool,requestAuthContext(request),assetId(request.params),options);});
 app.delete('/studio-api/assets/:id/upload',async(request,reply)=>{noQuery.parse(request.query);noQuery.parse(request.body);await cancelUpload(pool,requestAuthContext(request),assetId(request.params),options);return reply.code(204).send();});
 app.patch('/studio-api/assets/:id',async request=>{noQuery.parse(request.query);const {expectedRevision,...patch}=assetPatchSchema.parse(request.body);return changeAsset(pool,requestAuthContext(request),assetId(request.params),expectedRevision,patch,'patch',now());});
 for(const action of ['trash','restore'] as const)app.route({method:action==='trash'?'DELETE':'POST',url:'/studio-api/assets/:id'+(action==='restore'?'/restore':''),handler:async request=>{noQuery.parse(request.query);return changeAsset(pool,requestAuthContext(request),assetId(request.params),revision.parse(request.body).expectedRevision,{},action,now());}});
 app.get('/studio-api/assets/:id/content',async(request,reply)=>{
  const context=requestAuthContext(request),id=assetId(request.params),query=contentQuery.parse(request.query),row=await ownedAsset(pool,context,id),metadata=manifests(row);
  if(row.state!=='complete'||metadata.asset.trashedAt!=null)throw new HttpError(404,'NOT_FOUND');
  const manifest=metadata[query.variant];if(!manifest)throw new HttpError(404,'NOT_FOUND');const file=await assetFile(options,context.userId,id,query.variant,manifest);
  let range;try{range=byteRange(request.headers.range,manifest.bytes);}catch(error){reply.header('Content-Range',`bytes */${manifest.bytes}`);throw error;}
  reply.header('Content-Type',manifest.mimeType).header('X-Content-Type-Options','nosniff').header('Cross-Origin-Resource-Policy','same-origin').header('Accept-Ranges','bytes').header('Content-Length',range?range.end-range.start+1:manifest.bytes);
  if(range)reply.code(206).header('Content-Range',`bytes ${range.start}-${range.end}/${manifest.bytes}`);
  return reply.send(createReadStream(file,range));
 });
}
