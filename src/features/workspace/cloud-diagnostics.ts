import type {CloudRun} from '../../domain/cloud-video-run';
import type {Project} from '../../domain/project';
import type {ReceiptSummary} from '../../domain/command-receipt';
// 云端脱敏诊断报告：只用已有的账号只读接口组装，不新增服务端点。
// 白名单字段之外一律丢弃——提示词全文、提交原文、密钥、媒体文件永不进入报告。
export type ModelConfigPresence={channel:string;apiBase:string;model:string;hasKey:boolean};
const runFields=['executionState','queryState','deliveryState','billingState','issueCode','errorCode','model','apiBase','requestedSpec','createdAt','updatedAt'] as const;
function pickRun(run:CloudRun){
 const record=run as unknown as Record<string,unknown>,picked:Record<string,unknown>={id:run.id,kind:run.kind,projectId:run.projectId};
 for(const key of runFields)if(record[key]!==undefined)picked[key]=record[key];
 const failure=record['failure'];
 if(failure&&typeof failure==='object'&&typeof (failure as {message?:unknown}).message==='string')picked['failureMessage']=(failure as {message:string}).message;
 return picked;
}
export function buildCloudDiagnostics(input:{projects:Project[];receipts:{project:Project;receipt:ReceiptSummary}[];runs:CloudRun[];configs:ModelConfigPresence[];now?:number}){
 return {
  format:'aiwork-studio-cloud-diagnostics',version:1,exportedAt:input.now??Date.now(),
  projects:input.projects.map(project=>({id:project.id,title:project.title,revision:project.revision,updatedAt:project.updatedAt})),
  receipts:input.receipts.map(({project,receipt})=>({id:receipt.id,projectId:project.id,projectTitle:project.title,revision:receipt.revision,commandType:receipt.commandType,createdAt:receipt.createdAt})),
  runs:input.runs.map(pickRun),
  modelConfigs:input.configs.map(config=>({channel:config.channel,apiBase:config.apiBase,model:config.model,hasKey:config.hasKey})),
 };
}
export type CloudDiagnosticsReport=ReturnType<typeof buildCloudDiagnostics>;
