import type {CapabilityProfile} from '../../domain/connection';
import type {VideoSpec} from '../../domain/common';
import {getPreferences} from './preferences-store';
export function defaultVideoDraft(capability:CapabilityProfile):VideoSpec|undefined{const prefs=getPreferences(),modelId=prefs.defaultVideoModel||capability.videoModels[0];if(!modelId)return undefined;if(!capability.videoModels.includes(modelId))throw Error('default_video_model_unavailable');if(prefs.defaultDuration===null&&!prefs.defaultRatio)return {modelId};const spec=capability.videoSpecs.find(s=>s.modelId===modelId&&(prefs.defaultDuration===null||s.durationSeconds===prefs.defaultDuration)&&(!prefs.defaultRatio||s.ratio===prefs.defaultRatio));if(!spec)throw Error('default_video_spec_unavailable');return {...spec};}
