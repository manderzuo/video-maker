import {readFileSync} from 'node:fs';
export type LiveApproval={endpoint:string;bindingLabel:string;allowedTextSubmissions:number;allowedVideoSubmissions:number;expiresAt:number;costConstraint:string};
export function loadLiveApproval():LiveApproval|null{
 if(process.env.AIWORK_ALLOW_LIVE!=='1'||!process.env.AIWORK_LIVE_APPROVAL_FILE)return null;
 try{const value:unknown=JSON.parse(readFileSync(process.env.AIWORK_LIVE_APPROVAL_FILE,'utf8'));return validateLiveApproval(value)?value:null;}catch{return null;}
}
export function validateLiveApproval(input:unknown,now=Date.now()):input is LiveApproval{
 if(!input||typeof input!=='object')return false;
 const a=input as Record<string,unknown>;
 return typeof a.endpoint==='string'&&a.endpoint.startsWith('https://')&&typeof a.bindingLabel==='string'&&a.bindingLabel.length>0&&typeof a.expiresAt==='number'&&a.expiresAt>now&&typeof a.costConstraint==='string'&&a.costConstraint.length>0&&[a.allowedTextSubmissions,a.allowedVideoSubmissions].every(n=>typeof n==='number'&&Number.isInteger(n)&&n>=0);
}
