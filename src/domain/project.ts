import {z} from 'zod';
import {id,timestamp,revision,boundedText,tags,schemaVersion} from './common';
export const projectSchema=z.strictObject({id,schemaVersion:z.literal(schemaVersion),title:boundedText(1,60).refine(s=>s.trim().length>0,'名称不能为空白'),description:boundedText(0,500),revision,createdAt:timestamp,updatedAt:timestamp,archived:z.boolean(),trashedAt:timestamp.nullable(),tags:tags.default([]),starred:z.boolean().optional()});
export type Project=z.infer<typeof projectSchema>;
