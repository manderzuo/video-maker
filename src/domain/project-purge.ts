import {z} from 'zod';
const title=z.string().refine(value=>value.trim().length>0&&[...value].length<=60);
export const purgePreviewSchema=z.strictObject({projectId:z.uuid(),title:title,revision:z.number().int().min(0),nodeCount:z.number().int().min(0),assetCount:z.number().int().min(0),receiptCount:z.number().int().min(0),blockingReasons:z.array(z.string().max(200)),impactToken:z.string().min(1)});
export const purgeConfirmSchema=z.strictObject({title:title,expectedRevision:z.number().int().min(0),impactToken:z.string().min(1),confirmed:z.literal(true),idempotencyKey:z.uuid()});
export const purgeReceiptSchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),revision:z.number().int().min(0),nodeCount:z.number().int().min(0),createdAt:z.number().int().min(0)});
export type PurgePreview=z.infer<typeof purgePreviewSchema>;
export type PurgeReceipt=z.infer<typeof purgeReceiptSchema>;
export type PurgeConfirm=z.infer<typeof purgeConfirmSchema>;
