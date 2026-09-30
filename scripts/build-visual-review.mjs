import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const design=readFileSync('docs/superpowers/specs/AIWORK_Studio_Design_v1.md','utf8');
const supplement=readFileSync('docs/superpowers/specs/AIWORK_Studio_Prompt_Generation_Design_v1.1.md','utf8');
const pages=[];
for(const match of design.matchAll(/### (P\d{2}) · ([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n### |\r?\n## |$)/g)) {
 const [,id,title,body]=match;
 pages.push({id,title,goal:body.match(/\*\*目标\*\*：([^\r\n]+)/)?.[1]??'',requiredStates:body.match(/\*\*必须覆盖的状态\*\*：([^\r\n]+)/)?.[1]??''});
}
for(const [id,title,goal] of [['P21','独立提示词生成工作台','本地整理默认离线；AI优化与视频生成分别确认'],['P22','画布内提示词生成面板','与独立工作台使用同一草稿；应用前比较来源revision'],['P23','草稿结果与历史审阅','查看不可变输入与来源；恢复版本创建新草稿']]) pages.push({id,title,goal,requiredStates:'空白、加载、正常、错误、待检查、冲突、存储失败'});
const dialogs=[];
for(const match of design.matchAll(/^\| (D\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)){
 const [,id,title,width,fields,actions,rule]=match;dialogs.push({id,title:title.trim(),width:parseInt(width)||960,fields:fields.trim(),actions:actions.trim(),rule:rule.trim()});
}
for(const match of supplement.matchAll(/^\| (PGD\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)){
 const [,id,title,actions,rule]=match;dialogs.push({id,title:title.trim(),width:id==='PGD03'?800:720,fields:rule.trim(),actions:actions.trim()+'；取消',rule:rule.trim()});
}
if(pages.length!==23||dialogs.length!==30)throw Error(`Wrong source catalog: ${pages.length}/${dialogs.length}`);
mkdirSync('docs/design',{recursive:true});
const data={pages,dialogs};
writeFileSync('docs/design/review-data.json',JSON.stringify(data,null,2)+'\n');
writeFileSync('docs/design/review-data.js','window.REVIEW_DATA = '+JSON.stringify(data)+';\n');
const critical=[['canvas-save-failed','P03','error',null],['canvas-readonly','P03','readonly','D24'],['prompt-conflict','P21','conflict','PGD03'],['video-confirmation','P03','normal','D05'],['text-confirmation','P21','normal','PGD02'],['submission-unknown','P06','unknown','D21'],['prompt-saving-failed','P21','error','D20'],['agent-revision-conflict','P09','conflict','D15']];
const manifest={version:1,designBaseline:['Design 1.0','Design 1.1'],artifactType:'document-only-static-review',businessControlsDisabled:true,independentReviewDecision:'pending',pages:pages.map(p=>({...p,states:['empty','loading','normal','error'].map(state=>({state,viewport:{width:1440,height:900},theme:'dark',capturePath:`docs/design/captures/${p.id}-${state}-1440-dark.png`,reviewDecision:'pending'}))})),dialogs:dialogs.map(d=>({...d,capturePath:`docs/design/captures/${d.id}-1440-dark.png`,reviewDecision:'pending'})),criticalStates:critical.flatMap(([key,pageId,state,dialogId])=>[1440,1280,1024].flatMap(width=>['dark','light'].map(theme=>({key,pageId,state,dialogId,viewport:{width,height:900},theme,capturePath:`docs/design/captures/${key}-${width}-${theme}.png`,reviewDecision:'pending'})))),supplementalStates:[{key:'mobile-readonly',pageId:'P03',state:'readonly',viewport:{width:720,height:900},theme:'dark',capturePath:'docs/design/captures/mobile-readonly-720-dark.png',reviewDecision:'pending'},{key:'browser-zoom-125',pageId:'P21',state:'conflict',dialogId:'PGD03',viewport:{width:1440,height:900},browserZoom:1.25,theme:'dark',capturePath:null,verification:'not-executed',reason:'Actual browser zoom not tested',reviewDecision:'pending'},{key:'browser-zoom-150',pageId:'P03',state:'error',dialogId:'D20',viewport:{width:1280,height:900},browserZoom:1.5,theme:'light',capturePath:null,verification:'not-executed',reason:'Actual browser zoom not tested',reviewDecision:'pending'}]};
writeFileSync('docs/design/visual-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Document-only review catalog: ${pages.length} pages, ${dialogs.length} dialogs; decisions remain pending.`);
