import {z} from 'zod';
import {preferencesSchema} from '../../features/settings/preferences-store';
export const userPreferencesSchema=preferencesSchema.omit({lastVisitedPage:true,defaultTextModel:true,defaultVideoModel:true});
export const allowedAppPathSchema=preferencesSchema.shape.lastVisitedPage.removeDefault();
export const userDocumentSchema=z.strictObject({revision:z.number().int().min(0),onboardingCompletedAt:z.string().datetime().nullable(),preferences:userPreferencesSchema,lastVisitedPage:allowedAppPathSchema});
export type UserDocumentView=z.infer<typeof userDocumentSchema>;
export type UserPreferences=z.infer<typeof userPreferencesSchema>;
export type DocumentPatch={expectedRevision:number;preferences?:UserPreferences;lastVisitedPage?:UserDocumentView['lastVisitedPage']};
