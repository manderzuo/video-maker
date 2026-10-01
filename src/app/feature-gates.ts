import {capabilitySchema,type CapabilityProfile} from '../domain/connection';
export type FeatureId='image-generation'|'image-editing'|'audio-generation'|'video-cancel'|'webdav-backup'|'prompt-image-draft'|'video-stitching';
export type FeatureAvailability={id:FeatureId;executable:boolean;status:'available_local'|'blocked_capability'|'out_of_scope';reason:string;descriptionRoute:string;requirements:string[]};
const requirements:Record<FeatureId,string[]>={
 'image-generation':['Core 普通用户公开契约与固定部署版本','模型、尺寸、质量、数量和透明参数的能力与作用域证明','独立预算确认、专用适配器和授权测试'],
 'image-editing':['独立参考图、遮罩与编辑契约','普通用户作用域、素材限制和原图只读保护','参数预检、预算确认和真实授权测试'],
 'audio-generation':['Core 普通用户音频契约','文字、音色、语速与格式的版本化能力枚举','专用适配器、预算确认与授权测试'],
 'video-cancel':['Core 普通用户公开取消接口','取消请求、执行终态与账务的独立语义','原服务/授权绑定与真实回执验证'],
 'webdav-backup':['可选备份模块单独启用','固定授权端点、版本化快照与会话凭据保护','显式探测/上传授权、冲突另存与下载校验'],
 'prompt-image-draft':[],
 'video-stitching':['用户另行批准范围和实施计划'],
};
export function getFeatureAvailability(id:FeatureId,caps:CapabilityProfile):FeatureAvailability{
 if(id==='prompt-image-draft')return {id,executable:true,status:'available_local',reason:'可在本地编辑、保存图片提示词占位草稿；图片编译和生成尚未开放。',descriptionRoute:'/prompt-generator?type=image',requirements:[]};
 if(id==='video-stitching')return {id,executable:false,status:'out_of_scope',reason:'视频拼接和完整时间线剪辑不在本轮范围，未加入菜单或执行入口。',descriptionRoute:'/settings/capabilities',requirements:[...requirements[id]]};
 const valid=capabilitySchema.safeParse(caps),reason=valid.success&&valid.data.verification!=='unknown'?'当前适配器没有实现并核验此能力的普通用户公开契约。能力布尔值或模型可见不能单独开放执行。':'当前服务能力尚未核验，此条件能力未开放；仅显示说明，不发起业务请求。';
 return {id,executable:false,status:'blocked_capability',reason,descriptionRoute:id==='webdav-backup'?'/settings/backup':'/settings/capabilities',requirements:[...requirements[id]]};
}
