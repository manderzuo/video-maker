import {z} from 'zod';
import {promptLibrarySchema,promptDraftSchema,promptCompileResultSchema} from '../../../src/domain/prompt.js';
import {VIDEO_SCENES} from '../../../src/domain/prompt-engine/video-scenes.js';
export type ContentKind='prompt'|'draft';
const libraryContentSchema=promptLibrarySchema.extend({title:promptLibrarySchema.shape.title.refine(value=>!!value.trim()),body:promptLibrarySchema.shape.body.refine(value=>!!value.trim()),variables:promptLibrarySchema.shape.variables.refine(values=>new Set(values).size===values.length&&values.every(value=>!!value.trim()&&!['__proto__','constructor','prototype'].includes(value)&&!/[{}]/.test(value)))});
export const libraryCreateSchema=libraryContentSchema.omit({id:true,revision:true,trashed:true}).extend({tags:promptLibrarySchema.shape.tags.default([]),variables:libraryContentSchema.shape.variables.default([]),source:z.string().default('用户创作'),license:z.string().default('自有'),starred:z.boolean().default(false),idempotencyKey:z.uuid()});
export const libraryPatchSchema=libraryContentSchema.omit({id:true,revision:true,trashed:true}).partial().extend({expectedRevision:z.number().int().nonnegative()}).refine(value=>Object.keys(value).some(key=>key!=='expectedRevision'));
export const draftCreateSchema=promptDraftSchema.omit({id:true,revision:true,resultVersions:true}).extend({idempotencyKey:z.uuid()}).refine(value=>VIDEO_SCENES.some(scene=>scene.id===value.sceneId));
export const draftPatchSchema=promptDraftSchema.omit({id:true,revision:true,resultVersions:true}).partial().extend({expectedRevision:z.number().int().nonnegative()}).refine(value=>Object.keys(value).some(key=>key!=='expectedRevision'));
export const manualResultSchema=z.strictObject({expectedRevision:z.number().int().nonnegative(),result:promptCompileResultSchema.refine(value=>!!value.finalPrompt.trim())});
export function parseContent(kind:ContentKind,document:unknown){return kind==='prompt'?promptLibrarySchema.parse(document):promptDraftSchema.parse(document);}
export type Content=ReturnType<typeof parseContent>;
export {promptDraftSchema,promptLibrarySchema};
