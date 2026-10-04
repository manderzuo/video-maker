export function textFailureMessage(error:unknown){
 const value=error&&typeof error==='object'?error as {errorCode?:unknown;category?:unknown;httpStatus?:unknown;message?:unknown}:{};
 const code=typeof value.errorCode==='string'?value.errorCode:typeof value.message==='string'?value.message:'',status=typeof value.httpStatus==='number'&&Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599?`（HTTP ${value.httpStatus}）`:'';
 const reasons:Record<string,string>={text_session_required:'服务需要稳定会话标识，请更新本地客户端后重试。',text_session_invalid:'会话标识无效，请更新本地客户端后重试。',text_authentication_failed:'文字凭据未通过验证，请重新输入当前服务的 Key。',text_region_restricted:'服务商限制了当前区域，请在服务商控制台核实。',text_model_unavailable:'所选文字模型不可用，请核对服务商目录。',text_usage_limit:'文字额度或用量受限，请核对服务商控制台。',text_data_policy_restricted:'服务商的数据政策要求尚未满足，请在控制台核实。',local_settings_service_required:'本机连接服务不可用，请使用本机 Studio 启动入口。',settings_session_invalid:'本机连接会话无效，请重新打开连接设置。',connection_registration_failed:'本机连接登记失败，请检查地址和本地服务版本。',connection_metadata_unsafe:'连接名称或地址包含不允许的凭据信息。'};
 const categories:Record<string,string>={authentication:'文字凭据未通过验证，请重新输入当前服务的 Key。',forbidden:'服务拒绝访问，请核对账户权限与服务限制。',quota:'文字额度或用量受限，请核对服务商控制台。',rate_limited:'服务限流，请核对用量后再决定是否重试。',not_found:'文字接口或模型未找到，请核对 API 地址。',unavailable:'文字服务暂不可用，请保留原请求记录。',protocol:'文字服务响应不符合当前接口协议。'};
 const statusCategories:Record<number,string>={401:'authentication',402:'quota',403:'forbidden',404:'not_found',429:'rate_limited',500:'unavailable',502:'unavailable',503:'unavailable',504:'unavailable'};
 const category=typeof value.category==='string'&&Object.hasOwn(categories,value.category)?value.category:typeof value.httpStatus==='number'?statusCategories[value.httpStatus]:undefined;
 const reason=Object.hasOwn(reasons,code)?reasons[code]:category?categories[category]:'请求未获可核验结果，请保留原请求记录。';
 return '文字服务失败'+status+'：'+reason;
}
