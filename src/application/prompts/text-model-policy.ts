import {capabilitySchema,type CapabilityProfile} from '../../domain/connection';
export function isTextOnlyModel(modelId:string,caps:CapabilityProfile):boolean{
 const checked=capabilitySchema.safeParse(caps);if(!checked.success||checked.data.verification==='unknown'||typeof modelId!=='string'||!modelId.trim()||modelId!==modelId.trim())return false;
 const normalize=(id:string)=>id.trim().toLowerCase(),id=normalize(modelId);if(id==='seedance'||[...caps.videoModels,...caps.videoAliases].some(video=>normalize(video)===id))return false;
 return caps.textModels.includes(modelId);
}
