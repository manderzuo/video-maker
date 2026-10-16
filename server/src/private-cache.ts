import type {FastifyReply} from 'fastify';
export function privateRevalidation(reply:FastifyReply,etag:string){reply.header('Cache-Control','private, no-cache, must-revalidate').header('ETag',etag).header('Vary','Cookie, X-Workspace-Context');}
export function matchesEtag(value:string|string[]|undefined,etag:string){return typeof value==='string'&&value.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===etag);}
