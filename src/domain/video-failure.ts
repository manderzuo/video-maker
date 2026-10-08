const messages:Readonly<Record<string,string>>={
 budget_policy_expired:'执行网关的视频预算策略已过期，视频尚未提交。请更新网关预算配置；已发生的辅助费用和预冻结以 Core 核对结果为准。',
 video_not_submitted:'本次辅助步骤已结束，但未提交视频生成；不会自动重发。辅助步骤可能已扣费，账务以 Core 记录为准。',
 video_execution_failed:'上游已确认视频生成失败，未提供可公开确认的具体原因。失败不代表未扣费或退款。',
 seedance_budget_execution_failed:'Core 已确认本次视频执行失败；账务以 Core 记录为准，不会自动重发。',
 video_failure_reason_unavailable:'Core 已确认视频失败，暂未提供可展示的原因。失败不代表未扣费或退款。'
};
// Persist only recognized public terminal codes, never provider text or unknown strings.
export function safeVideoFailureCode(code:string|undefined):string{return code&&Object.hasOwn(messages,code)?code:'video_failure_reason_unavailable';}
export function videoFailureMessage(code:string|undefined):string{return messages[safeVideoFailureCode(code)];}
