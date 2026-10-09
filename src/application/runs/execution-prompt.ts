import type {VideoSpec} from '../../domain/common.js';

// Execution-only annotation: original creative text, literal dialogue and saved
// historical requests remain unchanged. Parameters are also sent structurally.
export function executionPrompt(source:string,spec:VideoSpec):string{
 const duration=[...source.matchAll(/(\d+(?:\.\d+)?)\s*秒/g)].map(m=>Number(m[1]));
 const ratios=[...source.matchAll(/(\d+)\s*[:：]\s*(\d+)/g)].map(m=>`${m[1]}:${m[2]}`);
 const resolutions=[...source.matchAll(/\b(480p|720p|1080p|4k)\b/gi)].map(m=>m[1].toLowerCase());
 const conflict=duration.some(n=>spec.durationSeconds!==undefined&&n!==spec.durationSeconds)||ratios.some(r=>spec.ratio!==undefined&&r!==spec.ratio)||resolutions.some(r=>spec.resolution!==undefined&&r!==spec.resolution.toLowerCase());
 if(!conflict)return source;
 return source+'\n\n视频执行规格（以视频界面选择为准）：'+[spec.durationSeconds===undefined?undefined:`总时长${spec.durationSeconds}秒`,spec.ratio?`画幅${spec.ratio}`:undefined,spec.resolution?`清晰度${spec.resolution}`:undefined].filter(Boolean).join('；')+'。上述创作资料中有关输出规格的表述由本行覆盖；对白、屏幕文字、主体、动作和镜头时间轴仍按原需求保留。';
}
