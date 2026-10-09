import {z} from 'zod';
import {graphSchema,viewportSchema} from '../../../src/domain/graph.js';
import {commandEnvelopeSchema} from '../../../src/application/commands/registry.js';
// Same field limits and view shape as the existing frontend project domain.
// Server DTOs stay self-contained for the NodeNext runtime.
const text=(min:number,max:number)=>z.string().refine(value=>[...value].length>=min&&[...value].length<=max);
const title=text(1,60).refine(value=>value.trim().length>0);
const description=text(0,500),tags=z.array(text(1,24)).max(10);
const editable={title,description,tags,starred:z.boolean(),archived:z.boolean()};
export const createProjectSchema=z.strictObject({title,description:description.default(''),tags:tags.default([]),starred:z.boolean().default(false)});
export const projectPatchSchema=z.strictObject({expectedRevision:z.number().int().min(0),title:title.optional(),description:description.optional(),tags:tags.optional(),starred:z.boolean().optional(),archived:z.boolean().optional()}).refine(value=>Object.keys(value).some(key=>key!=='expectedRevision'));
export const projectDeleteSchema=z.strictObject({expectedRevision:z.number().int().min(0)});
export const projectCopySchema=z.strictObject({expectedRevision:z.number().int().min(0),idempotencyKey:z.uuid(),title:title.optional()});
export const projectListSchema=z.strictObject({trashed:z.enum(['true','false']).optional()});
export const receiptListSchema=z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(20)});
export {purgePreviewSchema,purgeConfirmSchema,purgeReceiptSchema} from '../../../src/domain/project-purge.js';
export type {PurgePreview,PurgeReceipt,PurgeConfirm} from '../../../src/domain/project-purge.js';
// 客户端复用同一 domain 契约（见 src/domain/project-purge.ts），保持字节一致。
export const projectViewSchema=z.strictObject({id:z.uuid(),schemaVersion:z.literal(1),...editable,revision:z.number().int().min(0),createdAt:z.number().int().min(0),updatedAt:z.number().int().min(0),trashedAt:z.number().int().min(0).nullable()});
export const workspaceGraphSchema=graphSchema;
export const projectCommandSchema=z.strictObject({expectedRevision:z.number().int().min(0),idempotencyKey:z.uuid(),command:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('operations'),operations:commandEnvelopeSchema.shape.operations.max(500),viewport:viewportSchema.optional()}),
 z.strictObject({type:z.enum(['undo','redo'])}),
 z.strictObject({type:z.literal('viewport'),viewport:viewportSchema})
])});
export type ProjectCommand=z.infer<typeof projectCommandSchema>;
export type ProjectView=z.infer<typeof projectViewSchema>;
export type ProjectCreate=z.infer<typeof createProjectSchema>;
export type ProjectPatch=z.infer<typeof projectPatchSchema>;
