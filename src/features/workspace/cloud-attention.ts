import type {CloudRun} from '../../domain/cloud-video-run';
// Account-wide "needs attention" items derived from cloud task records. Every
// item links to the existing surface that handles it; this module never sends
// requests and never invents records.
export type AttentionItem={key:string;title:string;detail:string;href:string};
const videoIssueDetail:Record<string,string>={UPLOAD_UNKNOWN:'参考素材上传结果未知，尚未发送视频生成请求；可在任务中心核对后重试。',UPSTREAM_FAILED:'上游执行失败，账务以供应商记录为准；可在任务中心查看原因。',SECRET_UNAVAILABLE:'原密钥版本暂不可用，请恢复后在任务中心查询原任务。',OUTBOUND_BLOCKED:'请求被出站限制拦截，未发送；请检查 API 地址后重试。',RESULT_SAVE_PENDING:'生成已完成，文件保存尚未完成；查询原任务会继续尝试保存结果。'};
export function attentionItems(runs:CloudRun[]):AttentionItem[]{
 const items:AttentionItem[]=[];
 for(const run of runs){
  if(run.kind==='video'){
   if('historical' in run&&run.historical)continue;
   if(run.executionState==='submit_unknown'){items.push({key:run.id,title:'视频提交结果未知',detail:'原请求可能已经执行。请先核对供应商记录，再到任务中心决定下一步；不会自动重发。',href:'/tasks'});continue;}
   if(run.executionState==='failed_confirmed'){items.push({key:run.id,title:'视频生成未完成',detail:'可在任务中心查看失败原因；原输入与快照保留。',href:'/tasks'});continue;}
   if(run.issueCode&&videoIssueDetail[run.issueCode]){items.push({key:run.id,title:'视频任务需要处理',detail:videoIssueDetail[run.issueCode],href:'/tasks'});continue;}
   continue;
  }
  if(run.kind==='prompt-optimize'){
   if(run.executionState==='response_unknown'){items.push({key:run.id,title:'文字调用结果未知',detail:'结果尚未确认。请先核对后再决定是否重新调用；不会自动重发。',href:'/prompt-generator/history?draft='+encodeURIComponent(run.draftId)});continue;}
   if(run.executionState==='failed_confirmed'){items.push({key:run.id,title:'文字优化未完成',detail:'可在写作记录中查看原因'+(run.errorCode?'（'+run.errorCode+'）':'')+'；原草稿保留。',href:'/prompt-generator/history?draft='+encodeURIComponent(run.draftId)});continue;}
  }
 }
 return items;
}
