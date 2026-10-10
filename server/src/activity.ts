import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool} from 'pg';
import {z} from 'zod';
import {requestAuthContext} from './auth/context.js';
import {activitySchema} from '../../src/domain/activity.js';
import {HttpError} from './errors.js';

const cursorSchema=z.strictObject({at:z.string().datetime(),id:z.uuid()});
const querySchema=z.strictObject({projectId:z.uuid().optional(),unassigned:z.literal('true').optional(),cursor:z.string().max(300).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)});
async function projectFor(pool:Pool,request:FastifyRequest,payload:string|Buffer|null){
 const {userId}=requestAuthContext(request),route=request.routeOptions.url??'',params=request.params as {id?:string};
 let candidate:string|undefined;
 if(route.startsWith('/studio-api/projects/:id'))candidate=params.id;
 else if(route.startsWith('/studio-api/runs/:id')&&z.uuid().safeParse(params.id).success){const found=await pool.query('SELECT project_id FROM workspace_video_runs WHERE user_id=$1 AND id=$2',[userId,params.id]);candidate=found.rows[0]?.project_id;}
 else if(route.startsWith('/studio-api/prompt-drafts/:id')&&z.uuid().safeParse(params.id).success){const found=await pool.query("SELECT document->>'sourceProjectId' AS project_id FROM workspace_content WHERE user_id=$1 AND id=$2 AND kind='draft'",[userId,params.id]);candidate=found.rows[0]?.project_id;}
 if(!candidate&&payload&&typeof payload==='string'&&payload.length<1024*1024){try{const value=JSON.parse(payload) as {projectId?:unknown;sourceProjectId?:unknown;id?:unknown;project?:{id?:unknown}};const id=value.projectId??value.sourceProjectId??value.project?.id??(route==='/studio-api/projects'?value.id:undefined);if(z.uuid().safeParse(id).success)candidate=id as string;}catch{/* Response fields are used solely for owned-project classification. */}}
 if(!z.uuid().safeParse(candidate).success)return null;
 const owned=await pool.query('SELECT id,document->>\'title\' AS title FROM workspace_projects WHERE user_id=$1 AND id=$2',[userId,candidate]);return owned.rows[0] as {id:string;title:string}|undefined??null;
}
export function registerActivity(app:FastifyInstance,pool:Pool,now:()=>Date){
 app.get('/studio-api/activity',async request=>{
  const {userId}=requestAuthContext(request),query=querySchema.parse(request.query);
  let cursor:z.infer<typeof cursorSchema>|undefined;
  if(query.cursor){try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8')));}catch{throw new HttpError(400,'INVALID_REQUEST');}}
  const result=await pool.query('SELECT * FROM workspace_activity WHERE user_id=$1 AND ($2::uuid IS NULL OR project_id=$2) AND (NOT $3::boolean OR project_id IS NULL) AND ($4::timestamptz IS NULL OR (created_at,id)<($4,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6',[userId,query.projectId??null,query.unassigned==='true',cursor?.at??null,cursor?.id??null,query.limit+1]);
  const rows=result.rows.slice(0,query.limit),last=rows[rows.length-1];
  return {items:rows.map(row=>activitySchema.parse({id:row.id,projectId:row.project_id,projectTitle:row.project_title,method:row.method,route:row.route,status:row.status,createdAt:row.created_at.getTime(),historical:row.historical,...(row.execution_state?{executionState:row.execution_state}:{})})),nextCursor:result.rows.length>query.limit&&last?Buffer.from(JSON.stringify({at:last.created_at.toISOString(),id:last.id})).toString('base64url'):null};
 });
 // Only authenticated mutations are recorded. Canonical route names exclude raw
 // URLs, search strings, request bodies, credentials and provider response text.
 app.addHook('onSend',async(request,reply,payload)=>{
  const route=request.routeOptions.url;
  if(!route?.startsWith('/studio-api/')||route.includes('/auth/')||!['POST','PATCH','PUT','DELETE'].includes(request.method))return payload;
  if(route.endsWith('/commands')&&reply.statusCode<400)return payload; // The transaction's receipt trigger records these, including worker-created nodes.
  let userId:string;try{userId=requestAuthContext(request).userId;}catch{return payload;}
  try{const project=await projectFor(pool,request,typeof payload==='string'||Buffer.isBuffer(payload)?payload:null);await pool.query('INSERT INTO workspace_activity(id,user_id,project_id,project_title,method,route,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),userId,project?.id??null,project?.title??null,request.method,route,reply.statusCode,now()]);}
  catch{/* A completed mutation must never become an apparent failure and be repeated because its display audit could not be stored. */}
  return payload;
 });
}
