import type {CapabilityProfile} from '../../domain/connection';
import type {VideoSpec} from '../../domain/common';
import {getPreferences} from './preferences-store';
export function suggestDefaultVideoModel(origin:string,catalog:readonly string[],saved:string):string|undefined{
 return !saved&&origin==='https://api.gemstory.cn'&&catalog.includes('seedance')?'seedance':undefined;
}
export function defaultVideoDraft(capability:CapabilityProfile):VideoSpec|undefined{const prefs=getPreferences(),modelId=prefs.defaultVideoModel||capability.videoModels[0];if(!modelId)return undefined;if(!capability.videoModels.includes(modelId))throw Error('default_video_model_unavailable');if(prefs.defaultDuration===null&&!prefs.defaultRatio)return {modelId};const spec=capability.videoSpecs.find(s=>s.modelId===modelId&&(prefs.defaultDuration===null||s.durationSeconds===prefs.defaultDuration)&&(!prefs.defaultRatio||s.ratio===prefs.defaultRatio));if(!spec)throw Error('default_video_spec_unavailable');return {...spec};}
export function localWritingVideoDraft(capability:CapabilityProfile):VideoSpec|undefined{
 if(capability.verification!=='unknown')return defaultVideoDraft(capability);
 const prefs=getPreferences();return {modelId:prefs.defaultVideoModel||'unverified-video-draft',...(prefs.defaultDuration!==null?{durationSeconds:prefs.defaultDuration}:{}),...(prefs.defaultRatio?{ratio:prefs.defaultRatio}:{})};
}
