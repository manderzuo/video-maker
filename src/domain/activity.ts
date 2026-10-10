import {z} from 'zod';
export const activitySchema=z.strictObject({id:z.uuid(),projectId:z.uuid().nullable(),projectTitle:z.string().max(120).refine(value=>[...value].length<=60).nullable(),method:z.enum(['POST','PATCH','PUT','DELETE']),route:z.string().max(180),status:z.number().int().min(100).max(599),createdAt:z.number().int().nonnegative(),historical:z.boolean(),executionState:z.string().max(64).optional()});
export const activityPageSchema=z.strictObject({items:z.array(activitySchema),nextCursor:z.string().nullable()});
export type Activity=z.infer<typeof activitySchema>;
export function activityLabel(event:Pick<Activity,'route'|'method'>){
 const {route,method}=event;
 if(route.endsWith('/commands'))return '画布编辑与保存';
 if(route.endsWith('/runs/:id/status'))return '视频任务状态更新';
 if(route.endsWith('/prompt-tasks/:id/status'))return '文字优化任务状态更新';
 if(route.includes('optimization-preview'))return '准备文字优化';
 if(route.endsWith('/optimize'))return '确认文字优化';
 if(route.endsWith('/compile'))return '整理提示词';
 if(route.endsWith('/results'))return '保存提示词正文';
 if(route.includes('/video-run-preview'))return '准备视频生成';
 if(route.endsWith('/video-runs'))return '确认视频生成';
 if(route.includes('/runs'))return route.endsWith('/runs')?'确认视频生成':'视频任务操作';
 if(route.includes('/api-configs')||route.includes('/model-configs'))return 'API 配置与连接检测';
 if(route.includes('/me/document'))return '账号偏好与页面记录';
 if(route.includes('/assets'))return method==='PUT'?'上传素材文件':'素材操作';
 if(route.includes('/prompt-drafts'))return '写作草稿操作';
 if(route.includes('/prompts'))return '提示词库操作';
 if(route.endsWith('/copy'))return '复制项目';
 if(route.endsWith('/restore'))return '恢复项目';
 if(route.includes('/purge'))return '永久删除项目';
 if(route.includes('/projects'))return method==='POST'?'创建项目':method==='DELETE'?'项目移入回收站':'修改项目';
 return '账号工作区操作';
}
export function activityStateLabel(event:Activity){
 if(event.executionState)return ({persisted:'等待执行',uploading:'准备参考素材',submitting:'提交中',accepted:'已提交',running:'生成中',sending:'文字优化中',response_received:'回复已保存',succeeded:'已完成',failed:'执行失败',failed_confirmed:'执行失败',submit_unknown:'提交结果待核对',response_unknown:'调用结果待核对'} as Record<string,string>)[event.executionState]??'任务状态更新';
 return event.status<400?'已完成':'未完成';
}
