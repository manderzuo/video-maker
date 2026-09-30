export const copy={
 local:'可以先整理项目，连接 Core 后再生成。',
 saveFailed:'本次修改尚未保存。请先重试保存或导出草稿。',
 unknownSubmission:'提交结果暂未确认，请查询原任务，不要重复生成。',
 capabilityUnknown:'当前服务尚未验证此功能，暂不开放执行。',
 downloadFailed:'视频已完成，文件获取失败。重新下载不会创建新视频。'
} as const;
export const isEditableTarget=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"]');
export const browserTimeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
export const displayUtcTime=(milliseconds:number)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(milliseconds);
