import {z} from 'zod';
import type {BillingState} from './run';
const messages:Readonly<Record<string,string>>={
 video_reference_real_person_rejected:'生成失败：上游判定参考图片可能包含真人，拒绝生成。',
 budget_policy_expired:'执行网关的视频预算策略已过期，视频尚未提交。请更新网关预算配置；已发生的辅助费用和预冻结以 Core 核对结果为准。',
 video_not_submitted:'本次辅助步骤已结束，但未提交视频生成；不会自动重发。辅助步骤可能已扣费，账务以 Core 记录为准。',
 video_execution_failed:'上游已确认视频生成失败，未提供可公开确认的具体原因。失败不代表未扣费或退款。',
 seedance_budget_execution_failed:'Core 已确认本次视频执行失败；账务以 Core 记录为准，不会自动重发。',
 video_failure_reason_unavailable:'Core 已确认视频失败，暂未提供可展示的原因。失败不代表未扣费或退款。'
};
// Persist only recognized public terminal codes, never provider text or unknown strings.
export function safeVideoFailureCode(code:string|undefined):string{return code&&Object.hasOwn(messages,code)?code:'video_failure_reason_unavailable';}
export function videoFailureMessage(code:string|undefined):string{return messages[safeVideoFailureCode(code)];}

const gatewayCodes=['budget_policy_expired','video_not_submitted','video_execution_failed','seedance_budget_execution_failed','video_failure_reason_unavailable'] as const;
const reasonCodes=['video_reference_real_person_rejected',...gatewayCodes] as const;
const gatewayCodeSchema=z.enum(gatewayCodes);
export const videoFailureInfoSchema=z.strictObject({reasonCode:z.enum(reasonCodes),gatewayCode:gatewayCodeSchema.optional(),upstreamCode:z.string().regex(/^[0-9]{1,12}$/).optional()});
export type VideoFailureInfo=z.infer<typeof videoFailureInfoSchema>;
export type VideoFailureInput={gatewayCode?:unknown;message?:unknown;upstreamCode?:unknown;upstreamMessage?:unknown};
function isReferenceRejection(message:unknown):boolean{
 // Match the observed complete reference-image clause; unrelated prose stays generic.
 return typeof message==='string'&&message.length<=4096&&/^\s*input\s+image(?:\s+content\[[0-9]{1,3}\])?\s+may\s+contain\s+(?:a\s+)?real\s+person\.?\s*$/i.test(message);
}
export function normalizeVideoFailure(input:VideoFailureInput):VideoFailureInfo{
 const parsedGateway=gatewayCodeSchema.safeParse(input.gatewayCode),gateway=parsedGateway.success?parsedGateway.data:undefined;
 const recognizedGateway=gateway==='video_execution_failed'||gateway==='seedance_budget_execution_failed';
 const reasonCode=recognizedGateway&&(isReferenceRejection(input.message)||isReferenceRejection(input.upstreamMessage))?'video_reference_real_person_rejected':gateway??'video_failure_reason_unavailable';
 const rawCode=typeof input.upstreamCode==='number'&&Number.isSafeInteger(input.upstreamCode)&&input.upstreamCode>=0?String(input.upstreamCode):input.upstreamCode;
 const upstreamCode=typeof rawCode==='string'&&/^[0-9]{1,12}$/.test(rawCode)?rawCode:undefined;
 return {reasonCode,...(gateway?{gatewayCode:gateway}:{}),...(upstreamCode?{upstreamCode}:{})};
}
export function mergeVideoFailure(prior:VideoFailureInfo|undefined,incoming:VideoFailureInfo|undefined):VideoFailureInfo|undefined{
 const old=videoFailureInfoSchema.safeParse(prior),next=videoFailureInfoSchema.safeParse(incoming);
 if(!next.success)return old.success?old.data:undefined;
 if(!old.success)return next.data;
 const generic=['video_execution_failed','seedance_budget_execution_failed','video_failure_reason_unavailable'];
 if(!generic.includes(old.data.reasonCode)&&generic.includes(next.data.reasonCode))return old.data;
 if(old.data.reasonCode===next.data.reasonCode)return {...old.data,...next.data};
 return next.data;
}
export function videoFailureDetails(failure:VideoFailureInfo|undefined,billingState:BillingState):{message:string;upstreamCode?:string;billingMessage:string}{
 const parsed=videoFailureInfoSchema.safeParse(failure),safe=parsed.success?parsed.data:undefined;
 const billing:Record<BillingState,string>={pending_reconciliation:'积分仍在核对，尚未确认最终扣费。',reserved:'Core 记录预留，最终扣费仍待核对。',settled:'Core 已确认积分结算，具体扣费以 Core 记录为准。',released:'Core 已确认释放预留，具体账务以 Core 记录为准。',not_provided:'服务尚未提供最终账务，不能确认实际扣费或退款。'};
 return {message:videoFailureMessage(safe?.reasonCode),...(safe?.upstreamCode?{upstreamCode:safe.upstreamCode}:{}),billingMessage:billing[billingState]};
}
