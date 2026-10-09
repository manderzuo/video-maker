import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import type {Readable} from 'node:stream';
import {requestAuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {writeAssetFile,type AssetStorageOptions} from '../assets/storage.js';
import {migrationFileSchema,workspaceMigrationSchema} from '../../../src/domain/workspace-migration.js';
import {createImportSchema,commitImportSchema,createImport,ownedImport,importView} from './repository.js';
import {commitImport} from './service.js';
const empty=z.strictObject({});
function ids(value:unknown,file=false){const parsed=(file?z.strictObject({id:z.uuid(),fileId:z.uuid()}):z.strictObject({id:z.uuid()})).safeParse(value);if(!parsed.success)throw new HttpError(404,'NOT_FOUND');return parsed.data;}
export function registerMigrationRoutes(app:FastifyInstance,pool:Pool,storage:AssetStorageOptions,now:()=>Date){
 app.post('/studio-api/me/imports',{bodyLimit:16*1024*1024},async(request,reply)=>{empty.parse(request.query);return reply.code(201).send(await createImport(pool,requestAuthContext(request),createImportSchema.parse(request.body),storage,now()));});
 app.get('/studio-api/me/imports',async request=>{empty.parse(request.query);const context=requestAuthContext(request),rows=await pool.query<{id:string}>('SELECT id FROM workspace_imports WHERE user_id=$1 ORDER BY created_at DESC,id',[context.userId]);return Promise.all(rows.rows.map(async row=>importView(pool,context,await ownedImport(pool,context,row.id))));});
 app.get('/studio-api/me/imports/:id',async request=>{empty.parse(request.query);const context=requestAuthContext(request);return importView(pool,context,await ownedImport(pool,context,ids(request.params).id));});
 app.get('/studio-api/me/imports/:id/history',async request=>{empty.parse(request.query);return workspaceMigrationSchema.parse((await ownedImport(pool,requestAuthContext(request),ids(request.params).id)).document);});
 app.put('/studio-api/me/imports/:id/files/:fileId',{bodyLimit:storage.maxAssetBytes},async(request,reply)=>{empty.parse(request.query);const context=requestAuthContext(request),params=ids(request.params,true);if(request.headers['content-type']!=='application/octet-stream'||!('fileId'in params))throw new HttpError(400,'INVALID_REQUEST');const fileId=z.uuid().parse(params.fileId);await transaction(pool,async db=>{const batch=await ownedImport(db,context,params.id,true);if(batch.state!=='staged')throw new HttpError(409,'IMPORT_ALREADY_COMMITTED');const rows=await db.query<{manifest:unknown}>('SELECT manifest FROM workspace_import_files WHERE user_id=$1 AND batch_id=$2 AND id=$3 FOR UPDATE',[context.userId,batch.id,fileId]);if(!rows.rows[0])throw new HttpError(404,'NOT_FOUND');const manifest=migrationFileSchema.parse(rows.rows[0].manifest);await writeAssetFile(storage,context.userId,fileId,'original',manifest,request.body as Readable);await db.query('UPDATE workspace_import_files SET uploaded=true WHERE user_id=$1 AND id=$2',[context.userId,fileId]);});return reply.code(204).send();});
 app.post('/studio-api/me/imports/:id/commit',async request=>{empty.parse(request.query);return commitImport(pool,requestAuthContext(request),ids(request.params).id,commitImportSchema.parse(request.body),storage,now());});
}
