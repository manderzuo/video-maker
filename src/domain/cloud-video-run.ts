import {z} from 'zod';
import {runSchema} from './run.js';
import {videoRunSnapshotSchema} from './video-request.js';
import {cloudTaskSchema} from './cloud-task.js';
import {videoSpecSchema} from './common.js';
import {cloudAgentRunSchema} from './cloud-agent.js';
export const cloudVideoCapabilitySchema=z.strictObject({configRevision:z.number().int().positive(),apiBase:z.url(),model:z.string(),verified:z.boolean(),videoSpecs:z.array(videoSpecSchema),limits:z.strictObject({assetBytes:z.number().int().positive().optional(),promptBytes:z.number().int().positive().optional(),imageReferences:z.number().int().nonnegative().optional(),videoReferences:z.number().int().nonnegative().optional()}).optional()});
export type CloudVideoCapability=z.infer<typeof cloudVideoCapabilitySchema>;
export const cloudVideoRunSchema=runSchema.extend({kind:z.literal('video'),recordRevision:z.number().int().nonnegative().default(0),inputSnapshot:videoRunSnapshotSchema,configRevision:z.number().int().positive(),secretVersion:z.number().int().positive(),maxAutomaticRetries:z.literal(1).optional(),retryOfRunId:z.uuid().optional(),retryOfCoreTaskId:z.string().regex(/^[-A-Za-z0-9._~]{1,256}$/).optional(),retryRunId:z.uuid().optional(),issueCode:z.enum(['UPLOAD_UNKNOWN','UPSTREAM_FAILED','SECRET_UNAVAILABLE','OUTBOUND_BLOCKED','RESULT_SAVE_PENDING']).optional()});
export type CloudVideoRun=z.infer<typeof cloudVideoRunSchema>;
export const cloudVideoArchiveSchema=cloudVideoRunSchema.omit({connectionId:true,authBindingId:true,originSnapshot:true,idempotencyKey:true,finalBody:true,finalBodyHash:true,configRevision:true,secretVersion:true,taskId:true,coreRequestId:true,workContext:true,maxAutomaticRetries:true,retryOfRunId:true,retryOfCoreTaskId:true,retryRunId:true}).extend({historical:z.literal(true)});
export type CloudVideoArchive=z.infer<typeof cloudVideoArchiveSchema>;
export const cloudVideoRecordSchema=z.union([cloudVideoRunSchema,cloudVideoArchiveSchema]);
export type CloudVideoRecord=z.infer<typeof cloudVideoRecordSchema>;
export const cloudVideoSummarySchema=cloudVideoRunSchema.pick({id:true,kind:true,projectId:true,nodeId:true,executionState:true,queryState:true,deliveryState:true,billingState:true,resultAssetId:true,createdAt:true,updatedAt:true,recordRevision:true,requestedSpec:true,executionSpec:true,attentionCode:true,retryOfRunId:true,retryRunId:true}).extend({historical:z.literal(true).optional()});
export type CloudVideoSummary=z.infer<typeof cloudVideoSummarySchema>;
export function summarizeVideoRun(input:Record<string,unknown>){return cloudVideoSummarySchema.parse(Object.fromEntries(Object.keys(cloudVideoSummarySchema.shape).filter(key=>input[key]!==undefined).map(key=>[key,input[key]])));}
export const cloudRunSchema=z.union([cloudTaskSchema,cloudVideoRunSchema,cloudVideoArchiveSchema,cloudAgentRunSchema]);
export type CloudRun=z.infer<typeof cloudRunSchema>;
export function portableVideoRun(input:CloudVideoRecord):CloudVideoArchive{
 const {id,kind,projectId,nodeId,graphRevision,inputSnapshot,requestedSpec,executionSpec,executionState,queryState,deliveryState,billingState,resultAssetId,failure,attentionCode,executionFinishedAt,createdAt,updatedAt,recordRevision,issueCode}=input;
 return cloudVideoArchiveSchema.parse({id,kind,projectId,nodeId,graphRevision,inputSnapshot,requestedSpec,executionSpec,executionState,queryState,deliveryState,billingState,resultAssetId,failure,attentionCode,executionFinishedAt,createdAt,updatedAt,recordRevision,issueCode,historical:true});
}
export const cloudVideoPreviewSchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),graphRevision:z.number().int().nonnegative(),configRevision:z.number().int().positive(),apiBase:z.url(),model:z.string(),contractVersion:z.string(),expiresAt:z.number().int(),priorUnknownRunIds:z.array(z.uuid()),maxAutomaticRetries:z.literal(1).optional(),nodes:z.array(z.strictObject({nodeId:z.uuid(),title:z.string(),inputSnapshot:videoRunSnapshotSchema,assets:z.array(z.strictObject({assetId:z.uuid(),sha256:z.string(),bytes:z.number().int().positive(),mimeType:z.string(),title:z.string()})),dependencies:z.array(z.string())}))});
export type CloudVideoPreview=z.infer<typeof cloudVideoPreviewSchema>;
