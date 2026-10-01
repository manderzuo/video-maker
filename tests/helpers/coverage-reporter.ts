import fs from 'node:fs';import path from 'node:path';
import type {Reporter,TestCase,TestResult,TestStep,FullResult} from '@playwright/test/reporter';
type Location={file:string;line:number;column:number};
type Evidence={id:string;file:string;title:string;status:string;assertions:number;actions:number;assertionLocations:Location[];actionLocations:Location[];network?:{coreWrites:number;paidRequests:number;blockedRequests:number}};
const relative=(file:string)=>path.relative(process.cwd(),file).replaceAll('\\','/');
export default class CoverageReporter implements Reporter{
 private evidence=new Map<string,Evidence>();
 private identity(test:TestCase){return relative(test.location.file)+'::'+test.title;}
 onTestBegin(test:TestCase){const id=this.identity(test);this.evidence.set(id,{id,file:relative(test.location.file),title:test.title,status:'running',assertions:0,actions:0,assertionLocations:[],actionLocations:[]});}
 onStepEnd(test:TestCase,_result:TestResult,step:TestStep){const evidence=this.evidence.get(this.identity(test));if(!evidence||step.error)return;const location=step.location&&{...step.location,file:relative(step.location.file)};if(step.category==='expect'){evidence.assertions++;if(location)evidence.assertionLocations.push(location);}if(step.category==='pw:api'&&(/\.(click|dblclick|fill|check|uncheck|selectOption|setInputFiles|press|dragTo|focus|dispatchEvent)\b/.test(step.title)||/^(Click|Double click|Fill|Check|Uncheck|Select option|Set input files|Press|Drag|Focus|Dispatch)\b/i.test(step.title))){evidence.actions++;if(location)evidence.actionLocations.push(location);}}
 onTestEnd(test:TestCase,result:TestResult){const evidence=this.evidence.get(this.identity(test));if(evidence){evidence.status=result.status;const signal=test.annotations.find(annotation=>annotation.type==='studio:network-evidence');if(signal?.description){try{const observed=JSON.parse(signal.description);if(['coreWrites','paidRequests','blockedRequests'].every(key=>Number.isSafeInteger(observed[key])&&observed[key]>=0))evidence.network={coreWrites:observed.coreWrites,paidRequests:observed.paidRequests,blockedRequests:observed.blockedRequests};}catch{/* Missing evidence remains missing; never default to zero. */}}}}
 onEnd(result:FullResult){const target=process.env.STUDIO_COVERAGE_REPORT??'docs/review/logs/browser-executed-tests.json';fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({format:'aiwork-studio-executed-test-evidence',version:1,status:result.status,tests:[...this.evidence.values()]},null,2)+'\n');}
}
