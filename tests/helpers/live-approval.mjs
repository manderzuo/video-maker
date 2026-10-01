import {readFile} from 'node:fs/promises';
const fields=['schemaVersion','humanAuthorizationReference','studioOrigin','coreOrigin','authBindingId','expiresAt','allowedTextSubmissions','allowedVideoSubmissions','maximumCredits','budgetEnforcement','scenarioIds'];
function containsCredential(value){return !!value&&typeof value==='object'&&Object.entries(value).some(([name,child])=>/key|token|cookie|password|secret|credential|jwt/i.test(name)||containsCredential(child));}
function origin(value){try{const url=new URL(value);return url.origin===value&&!url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&url.hostname==='127.0.0.1');}catch{return false;}}
/** @param {{allowLive?:boolean,approval?:unknown,now?:number}} options */
export function evaluateLiveApproval({allowLive=false,approval,now=Date.now()}={}){
 const refuse=reason=>({allowed:false,reason,liveVerified:false,actualBusinessCalls:0});
 if(!allowLive)return refuse('allow_live_not_granted');if(!approval)return refuse('approval_missing');if(containsCredential(approval))return refuse('approval_must_not_contain_credentials');
 if(Object.keys(approval).some(field=>!fields.includes(field))||approval.schemaVersion!==1||!origin(approval.studioOrigin)||!origin(approval.coreOrigin)||typeof approval.humanAuthorizationReference!=='string'||!approval.humanAuthorizationReference.trim()||typeof approval.authBindingId!=='string'||!approval.authBindingId||!Array.isArray(approval.scenarioIds)||!approval.scenarioIds.length||approval.scenarioIds.some(id=>typeof id!=='string'||!id)||!Number.isFinite(approval.maximumCredits)||approval.maximumCredits<=0)return refuse('approval_invalid');
 if(!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=now)return refuse('approval_expired');
 if(![approval.allowedTextSubmissions,approval.allowedVideoSubmissions].every(value=>Number.isInteger(value)&&value>=0&&value<=1)||approval.allowedTextSubmissions+approval.allowedVideoSubmissions===0)return refuse('submission_count_out_of_scope');
 if(approval.budgetEnforcement?.verified!==true||typeof approval.budgetEnforcement.evidenceReference!=='string'||!approval.budgetEnforcement.evidenceReference)return refuse('core_budget_enforcement_unverified');
 return {allowed:true,reason:'approval_metadata_valid_only',liveVerified:false,actualBusinessCalls:0};
}
export async function loadLiveApproval(){
 if(process.env.AIWORK_ALLOW_LIVE!=='1')return {decision:evaluateLiveApproval(),approval:undefined};
 const file=process.env.AIWORK_LIVE_APPROVAL;if(!file)return {decision:evaluateLiveApproval({allowLive:true}),approval:undefined};
 try{const bytes=await readFile(file);if(bytes.length>65536)return {decision:{allowed:false,reason:'approval_too_large',liveVerified:false,actualBusinessCalls:0},approval:undefined};const approval=JSON.parse(bytes.toString('utf8'));return {decision:evaluateLiveApproval({allowLive:true,approval}),approval};}catch{return {decision:{allowed:false,reason:'approval_unreadable',liveVerified:false,actualBusinessCalls:0},approval:undefined};}
}
/** Test-only in-memory call bound; never a Core billing system or a verified credit ceiling. */
export function createLiveCallBound(approval){
 const used=new Set(),counts={text:0,video:0,read:0};let stopped=false;
 return {counts,reserve(kind,identity){if(!['text','video'].includes(kind))throw Error('generation_kind_invalid');if(stopped||used.has(identity))throw Error('no_automatic_live_retry');const maximum=kind==='text'?approval.allowedTextSubmissions:approval.allowedVideoSubmissions;if(counts[kind]>=maximum)throw Error('live_call_limit');used.add(identity);counts[kind]++;},recordRead(){counts.read++;},stop(){stopped=true;}};
}
