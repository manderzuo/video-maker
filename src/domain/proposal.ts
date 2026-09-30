import {z} from 'zod';
import {id,revision,snapshotSchema} from './common';
export const graphOperationSchema=z.strictObject({id,type:z.enum(['add_node','update_node','remove_node','add_edge','remove_edge','move_node','group','ungroup','select_result']),payload:z.record(z.string(),snapshotSchema)});
export type GraphOperation=z.infer<typeof graphOperationSchema>;
export const proposalSchema=z.strictObject({id,projectId:id,baseRevision:revision,sessionId:id,operations:z.array(graphOperationSchema),status:z.enum(['proposed','applied','rejected','conflict'])});
export type Proposal=z.infer<typeof proposalSchema>;
