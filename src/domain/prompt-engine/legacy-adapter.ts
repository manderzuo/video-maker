import {promptCompileInputSchema,type PromptCompileInput} from '../prompt';
export type LegacyPromptInput={userRequest:string;sceneId:string;duration?:string;ratio?:string;referenceNotes?:string;audioPlan?:string};
// Explicit migration only; never used as a second compiler or capability catalogue.
export function adaptLegacyVideoInput(input:LegacyPromptInput):PromptCompileInput{
 const specified=input.duration&&input.duration!=='自动判断';
 const match=specified?input.duration!.match(/^\s*(\d+(?:\.\d+)?)\s*秒\s*$/):undefined;
 if(specified&&!match)throw new Error('legacy_duration_ambiguous');
 return promptCompileInputSchema.parse({userRequest:input.userRequest,sceneId:input.sceneId,requestedSpec:{...(match?{durationSeconds:Number(match[1])}:{}),...(input.ratio&&input.ratio!=='自动判断'?{ratio:input.ratio}:{})},audioPlan:input.audioPlan??'',lockedConstraints:[],references:input.referenceNotes?.trim()?[{alias:'未绑定参考',mediaType:'image',role:'待确认',description:input.referenceNotes,unbound:true,available:false}]:[]});
}
