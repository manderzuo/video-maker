import {z} from 'zod';
import {runSchema} from './run.js';
import {videoRunSnapshotSchema} from './video-request.js';
import {cloudTaskSchema} from './cloud-task.js';
import {videoSpecSchema} from './common.js';
export const cloudVideoCapabilitySchema=z.strictObject({configRevision:z.number().int().positive(),apiBase:z.url(),model:z.string(),verified:z.boolean(),videoSpecs:z.array(videoSpecSchema)});
export type CloudVideoCapability=z.infer<typeof cloudVideoCapabilitySchema>;
export const cloudVideoRunSchema=runSchema.extend({kind:z.literal('video'),recordRevision:z.number().int().nonnegative().default(0),inputSnapshot:videoRunSnapshotSchema,configRevision:z.number().int().positive(),secretVersion:z.number().int().positive(),issueCode:z.enum(['UPLOAD_UNKNOWN','UPSTREAM_FAILED','SECRET_UNAVAILABLE','OUTBOUND_BLOCKED','RESULT_SAVE_PENDING']).optional()});
export type CloudVideoRun=z.infer<typeof cloudVideoRunSchema>;
export const cloudVideoArchiveSchema=cloudVideoRunSchema.omit({connectionId:true,authBindingId:true,originSnapshot:true,idempotencyKey:true,finalBody:true,finalBodyHash:true,configRevision:true,secretVersion:true,taskId:true,coreRequestId:true,workContext:true}).extend({historical:z.literal(true)});
export type CloudVideoArchive=z.infer<typeof cloudVideoArchiveSchema>;
export const cloudVideoRecordSchema=z.union([cloudVideoRunSchema,cloudVideoArchiveSchema]);
export type CloudVideoRecord=z.infer<typeof cloudVideoRecordSchema>;
export const cloudRunSchema=z.union([cloudTaskSchema,cloudVideoRunSchema,cloudVideoArchiveSchema]);
export type CloudRun=z.infer<typeof cloudRunSchema>;
export function portableVideoRun(input:CloudVideoRecord):CloudVideoArchive{
 const {id,kind,projectId,nodeId,graphRevision,inputSnapshot,requestedSpec,executionSpec,executionState,queryState,deliveryState,billingState,resultAssetId,failure,executionFinishedAt,createdAt,updatedAt,recordRevision,issueCode}=input;
 return cloudVideoArchiveSchema.parse({id,kind,projectId,nodeId,graphRevision,inputSnapshot,requestedSpec,executionSpec,executionState,queryState,deliveryState,billingState,resultAssetId,failure,executionFinishedAt,createdAt,updatedAt,recordRevision,issueCode,historical:true});
}
export const cloudVideoPreviewSchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),graphRevision:z.number().int().nonnegative(),configRevision:z.number().int().positive(),apiBase:z.url(),model:z.string(),contractVersion:z.string(),expiresAt:z.number().int(),priorUnknownRunIds:z.array(z.uuid()),nodes:z.array(z.strictObject({nodeId:z.uuid(),title:z.string(),inputSnapshot:videoRunSnapshotSchema,assets:z.array(z.strictObject({assetId:z.uuid(),sha256:z.string(),bytes:z.number().int().positive(),mimeType:z.string(),title:z.string()})),dependencies:z.array(z.string())}))});
export type CloudVideoPreview=z.infer<typeof cloudVideoPreviewSchema>;
