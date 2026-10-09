import {z} from 'zod';
import {projectSchema} from './project.js';
import {graphSchema} from './graph.js';
import {assetSchema} from './asset.js';
import {snapshotSchema} from './common.js';
const blocked=/^(?:__proto__|constructor|prototype|key|api_?key|token|access_?token|authorization|cookie|credentials?|password|secret|encrypted.*|ciphertext|iv|authTag|sessionIds?|grant|lease.*|executionApproval|approvals?|idempotencyKey|fingerprint|finalBody|finalBodyHash|requestBody|requestSnapshot|connectionId|authBindingId|originSnapshot|proxyBase|configRevision|secretVersion|taskId|coreRequestId|previewId|approvalId|remoteUrl|downloadUrl|contentUrl|uploadUrl)$/i;
export function portableMigrationContent(input:unknown,depth=0):unknown{
 if(depth>32)throw new Error('migration_invalid');
 if(typeof input==='string')return input.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已脱敏]').replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;"']+/gi,'[已脱敏]').replace(/https?:\/\/[^\s<>"']+/gi,match=>{try{const url=new URL(match);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[已移除临时链接]';}});
 if(Array.isArray(input))return input.map(value=>portableMigrationContent(value,depth+1));
 if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).filter(([key])=>!blocked.test(key)).map(([key,value])=>[key,portableMigrationContent(value,depth+1)]));
 return input;
}
function noExecution(input:unknown):boolean{if(!input||typeof input!=='object')return true;return Object.entries(input).every(([key,value])=>!blocked.test(key)&&noExecution(value));}
export const migrationSelectionSchema=z.strictObject({projectIds:z.array(z.string().min(1)).max(1000),includeStandalone:z.boolean(),includeTrash:z.boolean(),includePreferences:z.boolean()});
export type MigrationSelection=z.infer<typeof migrationSelectionSchema>;
export const migrationPreferencesSchema=z.strictObject({theme:z.enum(['dark','light','system']).optional(),density:z.enum(['comfortable','compact']).optional(),animation:z.enum(['system','reduced','full']).optional(),projectSort:z.enum(['updated','title']).optional(),projectList:z.boolean().optional(),autoPlay:z.boolean().optional(),muted:z.boolean().optional(),volume:z.number().min(0).max(1).optional(),showUnavailable:z.boolean().optional(),defaultDuration:z.number().positive().nullable().optional(),defaultRatio:z.string().max(32).optional()});
export const migrationRecordSchema=z.strictObject({kind:z.enum(['prompt','draft','video-history','text-history','agent-proposal','receipt-history','reference-history']),id:z.string().min(1).max(512),schemaVersion:z.literal(1),document:snapshotSchema.refine(noExecution),readonly:z.literal(true)});
export const migrationFileSchema=z.strictObject({path:z.string().regex(/^media\/[a-f0-9]{64}\.(original|thumbnail)$/),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.string().min(1).max(128)}).refine(file=>file.path==='media/'+file.sha256+'.'+file.path.split('.').at(-1));
export const workspaceMigrationSchema=z.strictObject({format:z.literal('aiwork-workspace-migration'),version:z.literal(1),exportId:z.uuid(),createdAt:z.number().int().nonnegative(),source:z.strictObject({database:z.literal('aiwork-studio:v1'),schemaVersion:z.number().int().positive()}),selection:migrationSelectionSchema,projects:z.array(z.strictObject({project:projectSchema,graph:graphSchema})).max(1000),assets:z.array(z.strictObject({asset:assetSchema,original:migrationFileSchema,thumbnail:migrationFileSchema.optional()})).max(5000),records:z.array(migrationRecordSchema).max(10000),preferences:migrationPreferencesSchema.optional()}).superRefine((data,ctx)=>{
 const projectIds=new Set(data.projects.map(row=>row.project.id)),assetIds=new Set(data.assets.map(row=>row.asset.id));
 if(projectIds.size!==data.projects.length||assetIds.size!==data.assets.length||new Set(data.records.map(row=>row.kind+':'+row.id)).size!==data.records.length||new Set(data.selection.projectIds).size!==data.selection.projectIds.length)ctx.addIssue({code:'custom',message:'迁移清单ID重复'});
 if(data.projects.some(row=>row.project.id!==row.graph.projectId||row.project.revision!==row.graph.revision)||data.selection.projectIds.some(id=>!projectIds.has(id)))ctx.addIssue({code:'custom',message:'迁移项目清单不完整'});
 for(const {asset,original,thumbnail}of data.assets)if(original.path.endsWith('.thumbnail')||asset.bytes!==original.bytes||asset.sha256!==original.sha256||asset.mimeType!==original.mimeType||thumbnail&&!thumbnail.path.endsWith('.thumbnail'))ctx.addIssue({code:'custom',message:'迁移文件清单不一致'});
 if(data.preferences&&!data.selection.includePreferences)ctx.addIssue({code:'custom',message:'偏好未选择'});
 function refs(input:unknown){if(!input||typeof input!=='object')return;for(const [key,value]of Object.entries(input)){if(['assetId','sourceAssetId','resultAssetId'].includes(key)&&typeof value==='string'&&!assetIds.has(value))ctx.addIssue({code:'custom',message:'迁移素材引用不完整'});else refs(value);}}
 refs([data.projects,data.records]);
 if(!noExecution(data))ctx.addIssue({code:'custom',message:'迁移包包含执行授权'});
});
export type WorkspaceMigration=z.infer<typeof workspaceMigrationSchema>;
export const migrationBatchSchema=z.strictObject({id:z.uuid(),exportId:z.uuid(),state:z.enum(['staged','committed']),createdAt:z.number().int().nonnegative(),counts:z.strictObject({projects:z.number().int().nonnegative(),assets:z.number().int().nonnegative(),records:z.number().int().nonnegative()}),files:z.array(z.strictObject({id:z.uuid(),path:z.string(),uploaded:z.boolean()})),preferencesAvailable:z.boolean(),mapping:z.strictObject({projects:z.record(z.string(),z.uuid()),assets:z.record(z.string(),z.uuid()),entries:z.record(z.string(),z.uuid()),drafts:z.record(z.string(),z.uuid())}).optional()});
export type MigrationBatch=z.infer<typeof migrationBatchSchema>;
