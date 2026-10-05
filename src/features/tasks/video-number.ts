import type {Run} from '../../domain/run';

/** Display label only: never use this number as a storage or execution identity. */
export function videoNumber(run:Pick<Run,'id'|'createdAt'>):string{
 const date=new Date(run.createdAt+8*60*60*1000),short=run.id.replace(/-/g,'').slice(0,6).toUpperCase();
 if(!Number.isFinite(date.getTime()))return '视频-'+short;
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `视频-${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}-${short}`;
}
