import {z} from 'zod';
import {id,videoSpecSchema} from './common.js';
export const connectionSchema=z.strictObject({id,name:id,proxyBase:z.string().startsWith('/'),originSnapshot:z.url(),contractVersion:id});
export type ConnectionProfile=z.infer<typeof connectionSchema>;
export const capabilitySchema=z.strictObject({contractVersion:id,verification:z.enum(['unknown','reviewed','live_verified']),textModels:z.array(id),videoModels:z.array(id),videoAliases:z.array(id),videoSpecs:z.array(videoSpecSchema),workContext:z.boolean(),continuation:z.boolean(),imageGeneration:z.boolean(),audioGeneration:z.boolean(),cancelVideo:z.boolean(),backup:z.boolean(),videoIdempotencyReplay:z.boolean().optional(),limits:z.strictObject({assetBytes:z.number().int().positive().optional(),promptBytes:z.number().int().positive().optional(),imageReferences:z.number().int().nonnegative().optional(),videoReferences:z.number().int().nonnegative().optional()}).optional()});
export type CapabilityProfile=z.infer<typeof capabilitySchema>;
export const unverifiedCapabilities=():CapabilityProfile=>({contractVersion:'unverified',verification:'unknown',textModels:[],videoModels:[],videoAliases:[],videoSpecs:[],workContext:false,continuation:false,imageGeneration:false,audioGeneration:false,cancelVideo:false,backup:false});
