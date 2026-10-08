import {z} from 'zod';
// Same field limits and view shape as the existing frontend project domain.
// Server DTOs stay self-contained for the NodeNext runtime.
const text=(min:number,max:number)=>z.string().refine(value=>[...value].length>=min&&[...value].length<=max);
const title=text(1,60).refine(value=>value.trim().length>0);
const description=text(0,500),tags=z.array(text(1,24)).max(10);
const editable={title,description,tags,starred:z.boolean(),archived:z.boolean()};
export const createProjectSchema=z.strictObject({title,description:description.default(''),tags:tags.default([]),starred:z.boolean().default(false)});
export const projectPatchSchema=z.strictObject({expectedRevision:z.number().int().min(0),title:title.optional(),description:description.optional(),tags:tags.optional(),starred:z.boolean().optional(),archived:z.boolean().optional()}).refine(value=>Object.keys(value).some(key=>key!=='expectedRevision'));
export const projectDeleteSchema=z.strictObject({expectedRevision:z.number().int().min(0)});
export const projectListSchema=z.strictObject({trashed:z.enum(['true','false']).optional()});
export const projectViewSchema=z.strictObject({id:z.uuid(),schemaVersion:z.literal(1),...editable,revision:z.number().int().min(0),createdAt:z.number().int().min(0),updatedAt:z.number().int().min(0),trashedAt:z.number().int().min(0).nullable()});
export const workspaceGraphSchema=z.strictObject({projectId:z.uuid(),revision:z.number().int().min(0),nodes:z.array(z.unknown()),edges:z.array(z.unknown()),viewport:z.strictObject({x:z.number().finite(),y:z.number().finite(),scale:z.number().min(.25).max(2)})});
export type ProjectView=z.infer<typeof projectViewSchema>;
export type ProjectCreate=z.infer<typeof createProjectSchema>;
export type ProjectPatch=z.infer<typeof projectPatchSchema>;
