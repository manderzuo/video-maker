import {z} from 'zod';
import {assetSchema} from '../../../src/domain/asset.js';
const mime=z.enum(['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','audio/wav','audio/ogg','audio/mpeg']);
export const thumbnailSchema=z.strictObject({bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:mime.refine(value=>value.startsWith('image/'))});
export const uploadSchema=z.strictObject({title:z.string().min(1).max(1024).refine(s=>!!s.trim()),mimeType:mime,bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),thumbnail:thumbnailSchema.optional(),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),durationSeconds:z.number().nonnegative().optional()});
export const assetPatchSchema=z.strictObject({expectedRevision:z.number().int().nonnegative(),...assetSchema.pick({title:true,tags:true,description:true}).partial().shape}).refine(value=>Object.keys(value).some(key=>key!=='expectedRevision'));
export type Upload=z.infer<typeof uploadSchema>;
export type AssetRow={id:string;state:'pending'|'complete';document:unknown;thumbnail:unknown|null};
export {assetSchema};
