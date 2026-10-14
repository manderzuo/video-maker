import {z} from 'zod';
import type {BillingState} from './run.js';
const messages:Readonly<Record<string,string>>={
 assistant_json_duplicate_key:'AI 规划结果包含重复或冲突字段，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_json_invalid:'AI 规划结果格式不完整或不合法，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_json_invalid_escape:'AI 规划结果的文字转义格式错误，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_json_control_character:'AI 规划结果包含未正确编码的字符，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_json_not_object:'AI 规划结果格式错误，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_output_truncated:'AI 规划结果被截断，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_output_too_large:'AI 规划结果超出长度限制，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_output_blocked:'辅助模型未能返回可用规划，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_output_invalid:'辅助模型返回的规划格式不受支持，视频尚未提交。辅助模型费用以 Core 结算为准。',
 assistant_schema_invalid:'AI 规划结果的字段或类型不符合要求，视频尚未提交。辅助模型费用以 Core 结算为准。',
 work_parent_required:'本次操作需要指定原视频，尚未提交视频生成。上传尾帧图片生成新片段时，请使用生成操作。辅助模型费用以 Core 结算为准。',
 work_decision_invalid:'AI 规划与本次操作或规格不一致，视频尚未提交。辅助模型费用以 Core 结算为准。',
 reference_resource_unavailable:'上游参考素材未通过下载预检，视频尚未提交。请稍后重新发起任务；已执行的辅助步骤费用仍按 Core 记录核对。',
 reference_resource_download_failed:'上游读取参考素材失败，视频未生成。可能涉及下载超时或访问凭证失效，具体原因尚未确认；不会自动重发，积分继续核对。',
 reference_asset_expired:'参考素材已过期，本次视频无法继续生成。请重新确认素材后发起新任务；已执行的辅助步骤费用及预留仍以 Core 账务记录为准。',
 reference_asset_missing:'参考素材已确认缺失，本次视频无法继续生成。请重新提供素材后发起新任务；已执行的辅助步骤费用及预留仍以 Core 账务记录为准。',
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

const gatewayCodes=['assistant_json_duplicate_key','assistant_json_invalid','assistant_json_invalid_escape','assistant_json_control_character','assistant_json_not_object','assistant_output_truncated','assistant_output_too_large','assistant_output_blocked','assistant_output_invalid','assistant_schema_invalid','work_parent_required','work_decision_invalid','reference_resource_unavailable','reference_resource_download_failed','reference_asset_expired','reference_asset_missing','budget_policy_expired','video_not_submitted','video_execution_failed','seedance_budget_execution_failed','video_failure_reason_unavailable'] as const;
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
