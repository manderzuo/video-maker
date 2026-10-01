import {z} from 'zod';
import {id,timestamp} from './common';
export const agentGrantSchema=z.strictObject({projectId:id,scope:z.enum(['selection','nodes','project']),nodeIds:z.array(id).max(1000).refine(ids=>new Set(ids).size===ids.length),access:z.enum(['read','propose']),expiresAt:timestamp,epoch:z.number().int().positive()});
export type AgentGrant=z.infer<typeof agentGrantSchema>;
export const agentSessionSchema=z.strictObject({id,projectId:id,allowedOrigin:z.url(),grant:agentGrantSchema,connected:z.boolean()});
export type AgentSession=z.infer<typeof agentSessionSchema>;
export const canvasIdentitySchema=z.strictObject({projectId:id,tabId:id,epoch:z.number().int().positive()});
export type CanvasIdentity=z.infer<typeof canvasIdentitySchema>;
export type AgentConnectInput=CanvasIdentity&{endpoint:string;token:string;origin:string};
