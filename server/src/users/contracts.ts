import {z} from 'zod';
// Pure server copy of current preferences: model defaults and remembered page excluded.
// Frontend sharing/identity initialization is intentionally a later stage.
export const pageSchema=z.enum(['/projects','/canvas','/assets','/prompts','/prompt-generator','/tasks','/activity','/settings/connections','/settings/models','/settings/appearance','/settings/storage','/help','/trash','/recovery']);
export const preferencesSchema=z.strictObject({projectSort:z.enum(['updated','title']),projectList:z.boolean(),theme:z.enum(['dark','light','system']),density:z.enum(['comfortable','compact']),animation:z.enum(['system','reduced','full']),autoPlay:z.boolean(),muted:z.boolean(),volume:z.number().min(0).max(1),showUnavailable:z.boolean(),defaultDuration:z.number().positive().nullable(),defaultRatio:z.string().max(32)});
export const defaultPreferences: z.infer<typeof preferencesSchema>={projectSort:'updated',projectList:false,theme:'dark',density:'comfortable',animation:'system',autoPlay:false,muted:true,volume:1,showUnavailable:true,defaultDuration:null,defaultRatio:''};
export const documentPatchSchema=z.strictObject({expectedRevision:z.number().int().min(0),preferences:preferencesSchema.optional(),lastVisitedPage:pageSchema.optional()}).refine(value=>value.preferences!==undefined||value.lastVisitedPage!==undefined);
export const onboardingSchema=z.strictObject({expectedRevision:z.number().int().min(0),completed:z.literal(true)});
export const documentViewSchema=z.strictObject({revision:z.number().int().min(0),onboardingCompletedAt:z.string().datetime().nullable(),preferences:preferencesSchema,lastVisitedPage:pageSchema});
export type UserDocumentView=z.infer<typeof documentViewSchema>;
