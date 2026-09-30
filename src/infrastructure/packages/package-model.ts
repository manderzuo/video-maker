import {z} from 'zod';
import {assetSchema} from '../../domain/asset';
import {projectSchema} from '../../domain/project';
import {graphSchema} from '../../domain/graph';
import {promptDraftSchema} from '../../domain/prompt';
import {runSchema} from '../../domain/run';
import {sanitizeKnownSecrets} from '../../security/credential-session';
import {snapshotAssetIds} from '../../features/assets/reference-index';
export const manifestSchema=z.strictObject({format:z.literal('aiwork-studio-project'),schemaVersion:z.number().int().positive(),mode:z.enum(['full','structure']),createdAt:z.number().int().nonnegative(),assets:z.array(assetSchema.extend({path:z.string().optional()}))});
// Historical identity and content remain useful, but dispatch bodies/keys and all
// approval receipts are deliberately outside the portable format.
export const historyRunSchema=runSchema.omit({idempotencyKey:true,finalBody:true,finalBodyHash:true}).extend({originalRunId:z.string().optional(),originalProjectId:z.string().optional(),readonly:z.literal(true).optional()});
export type HistoryRun=z.infer<typeof historyRunSchema>;
export const packageDataSchema=z.strictObject({manifest:manifestSchema,project:projectSchema,graph:graphSchema,runs:z.array(historyRunSchema),drafts:z.array(promptDraftSchema)});
export type PackageData=z.infer<typeof packageDataSchema>;
const prohibited=/^(?:key|api_?key|token|access_?token|authorization|credentials?|cookie|password|secret|script|scripts|autoRun|automaticTasks|executionApproval|approvals?|finalBody|finalBodyHash|idempotencyKey|remoteUrl|downloadUrl|contentUrl|uploadUrl|promptRunId)$/i;
export function countExcludedFields(input:unknown):number{if(Array.isArray(input))return input.reduce((count,value)=>count+countExcludedFields(value),0);if(!input||typeof input!=='object')return 0;return Object.entries(input).reduce((count,[key,value])=>count+(prohibited.test(key)||['__proto__','constructor','prototype'].includes(key)?1:countExcludedFields(value)),0);}
export function portableContent(input:unknown,depth=0):unknown{if(depth>32)throw Error('import_unsafe');if(typeof input==='string')return sanitizeKnownSecrets(input).replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[已移除临时链接]';}});if(input===null||typeof input==='number'||typeof input==='boolean')return input;if(Array.isArray(input))return input.map(v=>portableContent(v,depth+1));if(!input||typeof input!=='object')return undefined;const output:Record<string,unknown>={};for(const [key,value]of Object.entries(input))if(!prohibited.test(key)&&!['__proto__','constructor','prototype'].includes(key)){const next=portableContent(value,depth+1);if(next!==undefined)output[key]=next;}return output;}
export function packageAssetIds(data:Pick<PackageData,'graph'|'runs'|'drafts'>){return snapshotAssetIds([data.graph.nodes,data.runs.map(r=>({resultAssetId:r.resultAssetId,inputSnapshot:r.readonly?undefined:r.inputSnapshot})),data.drafts]);}
