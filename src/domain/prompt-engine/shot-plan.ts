import type {Shot} from '../prompt';
import type {CapabilityProfile} from '../connection';
export function planShots(totalSeconds:number,prompt:string,caps:CapabilityProfile,modelId:string):Shot[]{
 const durations=[...new Set(caps.videoSpecs.filter(s=>s.modelId===modelId&&s.durationSeconds!==undefined).map(s=>s.durationSeconds!))].filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>b-a);
 if(caps.verification==='unknown'||!caps.videoModels.includes(modelId)||!durations.length)throw new Error('shot_limit_unverified');
 if(!Number.isFinite(totalSeconds)||totalSeconds<=0||totalSeconds>3600)throw new Error('shot_total_invalid');
 // Millisecond precision and an explicit bounded search avoid unbounded recursion.
 const units=durations.map(n=>Math.round(n*1000));const total=Math.round(totalSeconds*1000);
 if(Math.abs(total/1000-totalSeconds)>1e-6||durations.some((n,i)=>Math.abs(units[i]/1000-n)>1e-6))throw new Error('shot_precision_unsupported');
 const plans=new Map<number,number[]>([[0,[]]]);let frontier=[0];
 for(let depth=0;depth<200&&frontier.length;depth++){
  const next:number[]=[];
  for(const sum of frontier)for(let i=0;i<units.length;i++){const added=sum+units[i];if(added>total||plans.has(added))continue;plans.set(added,[...plans.get(sum)!,durations[i]]);if(added===total)return plans.get(added)!.map((duration,index)=>({id:`shot-${index+1}`,durationSeconds:duration,prompt,startState:index?'延续上一镜头经人工确认的结束状态':'按原始需求建立主体与场景',endState:'待人工确认的衔接状态'}));next.push(added);if(plans.size>100000)throw new Error('shot_planning_limit');}
  frontier=next;
 }
 throw new Error('shot_duration_unrepresentable');
}
