import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {transaction} from '../db/transaction.js';
import {HttpError} from '../errors.js';
import {workspaceMigrationSchema,migrationBatchSchema,migrationFileSchema,type WorkspaceMigration} from '../../../src/domain/workspace-migration.js';
import type {AssetStorageOptions} from '../assets/storage.js';
export const createImportSchema=z.strictObject({data:workspaceMigrationSchema,idempotencyKey:z.uuid()});
export const commitImportSchema=z.strictObject({confirmedOwner:z.literal(true),importPreferences:z.boolean(),expectedDocumentRevision:z.number().int().nonnegative().optional()}).refine(value=>!value.importPreferences||value.expectedDocumentRevision!==undefined);
export type ImportRow={id:string;document:unknown;state:'staged'|'committed';mapping:unknown;created_at:Date;fingerprint:string;reserved_bytes:string};
export function canonicalMigration(input:unknown):string{if(Array.isArray(input))return '['+input.map(canonicalMigration).join(',')+']';if(input&&typeof input==='object')return '{'+Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>JSON.stringify(key)+':'+canonicalMigration(value)).join(',')+'}';return JSON.stringify(input);}
export async function ownedImport(db:Pool|PoolClient,context:AuthContext,id:string,lock=false){const rows=await db.query<ImportRow>('SELECT id,document,state,mapping,created_at,fingerprint,reserved_bytes FROM workspace_imports WHERE user_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[context.userId,id]);if(!rows.rows[0])throw new HttpError(404,'NOT_FOUND');return rows.rows[0];}
export async function importView(db:Pool|PoolClient,context:AuthContext,row:ImportRow){const data=workspaceMigrationSchema.parse(row.document),files=await db.query<{id:string;manifest:unknown;uploaded:boolean}>('SELECT id,manifest,uploaded FROM workspace_import_files WHERE user_id=$1 AND batch_id=$2 ORDER BY id',[context.userId,row.id]);return migrationBatchSchema.parse({id:row.id,exportId:data.exportId,state:row.state,createdAt:row.created_at.getTime(),counts:{projects:data.projects.length,assets:data.assets.length,records:data.records.length},preferencesAvailable:!!data.preferences,files:files.rows.map(file=>({id:file.id,path:migrationFileSchema.parse(file.manifest).path,uploaded:file.uploaded})),...(row.mapping?{mapping:row.mapping}:{})});}
export async function createImport(pool:Pool,context:AuthContext,input:z.infer<typeof createImportSchema>,storage:AssetStorageOptions,now:Date){
 const fingerprint=createHash('sha256').update(canonicalMigration(input.data)).digest('hex');
 return transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[context.userId+':asset-quota']);
  const prior=await db.query<ImportRow>('SELECT id,document,state,mapping,created_at,fingerprint,reserved_bytes FROM workspace_imports WHERE user_id=$1 AND (idempotency_key=$2 OR export_id=$3) FOR UPDATE',[context.userId,input.idempotencyKey,input.data.exportId]);
  if(prior.rows.length){if(prior.rows.length!==1||prior.rows[0].fingerprint!==fingerprint)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return importView(db,context,prior.rows[0]);}
  const files=new Map<string,WorkspaceMigration['assets'][number]['original']>();for(const asset of input.data.assets)for(const file of [asset.original,...(asset.thumbnail?[asset.thumbnail]:[])]){if(file.bytes>(file.path.endsWith('.thumbnail')?storage.maxThumbnailBytes:storage.maxAssetBytes)||!['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','audio/wav','audio/ogg','audio/mpeg'].includes(file.mimeType))throw new HttpError(400,'INVALID_REQUEST');const prior=files.get(file.path);if(prior&&canonicalMigration(prior)!==canonicalMigration(file))throw new HttpError(400,'INVALID_REQUEST');files.set(file.path,file);}
  const reserved=[...files.values()].reduce((total,file)=>total+file.bytes,0),used=await db.query<{bytes:string}>('SELECT ((SELECT COALESCE(SUM(reserved_bytes),0) FROM workspace_assets WHERE user_id=$1)+(SELECT COALESCE(SUM(reserved_bytes),0) FROM workspace_imports WHERE user_id=$1))::text AS bytes',[context.userId]);if(Number(used.rows[0].bytes)+reserved>storage.userQuotaBytes)throw new HttpError(413,'USER_QUOTA_EXCEEDED');
  const id=randomUUID();await db.query("INSERT INTO workspace_imports(user_id,id,idempotency_key,export_id,fingerprint,document,state,reserved_bytes,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,'staged',$7,$8)",[context.userId,id,input.idempotencyKey,input.data.exportId,fingerprint,JSON.stringify(input.data),reserved,now]);
  for(const file of files.values())await db.query('INSERT INTO workspace_import_files(user_id,batch_id,id,manifest) VALUES($1,$2,$3,$4::jsonb)',[context.userId,id,randomUUID(),JSON.stringify(file)]);return importView(db,context,await ownedImport(db,context,id));
 });
}
