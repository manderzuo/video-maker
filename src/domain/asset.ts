import {z} from 'zod';
import {id,timestamp} from './common';
export const assetSchema=z.strictObject({id,sha256:z.string().regex(/^[a-f0-9]{64}$/),mediaType:z.enum(['image','video','audio','text']),mimeType:id,bytes:z.number().int().nonnegative(),blobKey:id,title:z.string(),durationSeconds:z.number().nonnegative().optional(),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),sourceRunId:id.optional(),createdAt:timestamp});
export type Asset=z.infer<typeof assetSchema>;
