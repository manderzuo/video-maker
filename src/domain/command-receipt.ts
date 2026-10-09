import {z} from 'zod';
// Account-scoped cloud activity summaries. Full graphs stay on the project
// endpoints; this is the read-only history surface the shell uses.
export const receiptSummarySchema=z.strictObject({id:z.uuid(),projectId:z.uuid(),revision:z.number().int().positive(),commandType:z.enum(['operations','undo','redo','viewport']),createdAt:z.number().int().min(0)});
export type ReceiptSummary=z.infer<typeof receiptSummarySchema>;
