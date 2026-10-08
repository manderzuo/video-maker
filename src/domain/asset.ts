import {z} from 'zod';
import {id,timestamp,tags,revision,boundedText} from './common.js';
export const assetSchema=z.strictObject({id,sha256:z.string().regex(/^[a-f0-9]{64}$/),mediaType:z.enum(['image','video','audio','text']),mimeType:id,bytes:z.number().int().nonnegative(),blobKey:id,title:z.string().refine(s=>!!s.trim(),'名称不能为空'),tags:tags.optional(),description:boundedText(0,500).optional(),metadataRevision:revision.optional(),durationSeconds:z.number().nonnegative().optional(),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),sourceRunId:id.optional(),createdAt:timestamp,trashedAt:timestamp.nullable().optional()});
export type Asset=z.infer<typeof assetSchema>;
