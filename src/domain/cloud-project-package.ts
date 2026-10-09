import {z} from 'zod';
import {graphSchema} from './graph.js';
import {assetSchema} from './asset.js';
import {projectSchema} from './project.js';
import {promptLibrarySchema,promptDraftSchema} from './prompt.js';
import {cloudTaskSchema} from './cloud-task.js';
import {cloudVideoArchiveSchema} from './cloud-video-run.js';
export const privateFileSchema=z.strictObject({bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.enum(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','audio/wav','audio/ogg','audio/mpeg'])});
const historyReceiptSchema=z.strictObject({id:z.uuid(),revision:z.number().int().positive(),type:z.enum(['operations','undo','redo','viewport']),before:graphSchema,after:graphSchema,createdAt:z.number().int().nonnegative()});
export const cloudContentRecordSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('prompt'),document:promptLibrarySchema,versions:z.array(promptLibrarySchema),trashed:z.boolean()}),
 z.strictObject({kind:z.literal('draft'),document:promptDraftSchema,versions:z.array(promptDraftSchema),trashed:z.boolean()})
]).superRefine((value,ctx)=>{
 if(new Set(value.versions.map(v=>v.revision)).size!==value.versions.length||value.versions.some(v=>v.id!==value.document.id||v.revision>value.document.revision)||!value.versions.some(v=>JSON.stringify(v)===JSON.stringify(value.document)))ctx.addIssue({code:'custom',message:'内容版本不完整'});
});
export const cloudProjectPackageSchema=z.strictObject({
 format:z.literal('aiwork-studio-cloud-project'),version:z.literal(1),createdAt:z.number().int().nonnegative(),
 project:projectSchema,graph:graphSchema,
 assets:z.array(z.strictObject({asset:assetSchema,thumbnail:privateFileSchema.optional()})),
 content:z.array(cloudContentRecordSchema).optional(),
 taskHistory:z.array(z.union([cloudTaskSchema,cloudVideoArchiveSchema])).optional(),
 history:z.strictObject({receipts:z.array(historyReceiptSchema),undo:z.array(z.uuid()),redo:z.array(z.uuid())})
}).superRefine((value,ctx)=>{
 const receiptIds=new Set(value.history.receipts.map(r=>r.id)),assets=new Set(value.assets.map(r=>r.asset.id));
 if(assets.size!==value.assets.length||receiptIds.size!==value.history.receipts.length||value.project.id!==value.graph.projectId||value.project.revision!==value.graph.revision)ctx.addIssue({code:'custom',message:'包中记录不一致'});
 if([...value.history.undo,...value.history.redo].some(id=>!receiptIds.has(id))||new Set([...value.history.undo,...value.history.redo]).size!==value.history.undo.length+value.history.redo.length)ctx.addIssue({code:'custom',message:'撤销历史不完整'});
 if(value.history.receipts.some(r=>r.before.projectId!==value.project.id||r.after.projectId!==value.project.id))ctx.addIssue({code:'custom',message:'历史项目不一致'});
 if(new Set(value.content?.map(record=>record.document.id)).size!==(value.content?.length??0))ctx.addIssue({code:'custom',message:'内容ID重复'});
 const content=new Map(value.content?.map(record=>[record.document.id,record]));
 const tasks=new Map(value.taskHistory?.map(task=>[task.id,task]));
 if(tasks.size!==(value.taskHistory?.length??0)||(value.taskHistory??[]).some(task=>task.kind==='prompt-optimize'&&content.get(task.draftId)?.kind!=='draft'))ctx.addIssue({code:'custom',message:'任务历史来源不完整'});
 for(const record of value.content??[])if(record.kind==='draft')for(const input of record.versions)for(const version of input.resultVersions)if(version.promptRunId){const task=tasks.get(version.promptRunId);if(!task||task.kind!=='prompt-optimize'||task.draftId!==record.document.id||task.sourceRevision!==version.sourceRevision)ctx.addIssue({code:'custom',message:'结果任务历史不完整'});}
 function check(input:unknown){if(!input||typeof input!=='object')return;for(const [key,item]of Object.entries(input)){if(['assetId','sourceAssetId','resultAssetId'].includes(key)&&typeof item==='string'&&!assets.has(item))ctx.addIssue({code:'custom',message:'素材清单不完整'});else check(item);}}
 check([value.graph,...value.history.receipts.flatMap(r=>[r.before,r.after]),value.content,value.taskHistory]);
 for(const {asset}of value.assets)if(asset.sourceRunId){const run=tasks.get(asset.sourceRunId);if(!run||run.kind!=='video'||run.resultAssetId!==asset.id||run.executionState!=='succeeded')ctx.addIssue({code:'custom',message:'视频原件来源不完整'});}
 for(const graph of [value.graph,...value.history.receipts.flatMap(r=>[r.before,r.after])])for(const node of graph.nodes)if(node.type==='text'){
  if(node.data.promptLibrarySource&&content.get(node.data.promptLibrarySource.entryId)?.kind!=='prompt'||node.data.promptGenerationSource&&content.get(node.data.promptGenerationSource.draftId)?.kind!=='draft')ctx.addIssue({code:'custom',message:'提示词来源清单不完整'});
 }
});
export type CloudProjectPackage=z.infer<typeof cloudProjectPackageSchema>;
// This format carries content and undo history, never execution authorization.
export function portableCloudContent(input:unknown,depth=0):unknown{
 if(depth>32)throw new Error('package_invalid');
 if(typeof input==='string')return input.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [已脱敏]').replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;"']+/gi,'[已脱敏]').replace(/https?:\/\/[^\s<>"']+/gi,match=>{try{const url=new URL(match);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[已移除临时链接]';}});
 if(Array.isArray(input))return input.map(value=>portableCloudContent(value,depth+1));
 if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).filter(([key])=>!['__proto__','constructor','prototype','authorization','apiKey','cookie','password','secret','finalBody','idempotencyKey','executionApproval'].includes(key)).map(([key,value])=>[key,portableCloudContent(value,depth+1)]));
 return input;
}
export function packageMediaPath(sha256:string,variant:'original'|'thumbnail'){
 if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('package_invalid');return 'media/'+sha256+'.'+variant;
}
