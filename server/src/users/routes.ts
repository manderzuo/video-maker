import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {requestAuthContext} from '../auth/context.js';
import {documentPatchSchema,onboardingSchema} from './contracts.js';
import {readDocument,updateDocument} from './document-repository.js';
const noQuery=z.strictObject({});
export function registerUserRoutes(app:FastifyInstance,pool:Pool,now:()=>Date){
 app.get('/studio-api/me/document',async request=>{noQuery.parse(request.query);return readDocument(pool,requestAuthContext(request));});
 app.patch('/studio-api/me/document',async request=>{noQuery.parse(request.query);return updateDocument(pool,requestAuthContext(request),documentPatchSchema.parse(request.body));});
 app.patch('/studio-api/me/onboarding',async request=>{noQuery.parse(request.query);const patch=onboardingSchema.parse(request.body);return updateDocument(pool,requestAuthContext(request),{expectedRevision:patch.expectedRevision,completedAt:now()});});
}
