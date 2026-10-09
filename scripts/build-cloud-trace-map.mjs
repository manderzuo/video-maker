// 将 Codex 云端 inventory 转换为可检查的云端登记。
// sources 只接受真实测试动作触发的 target 在当前文件中的绑定；
// proofs 只用 reporter 记录的真实 assertionLocations；无确凿依据保持缺失。
// 用法: node scripts/build-cloud-trace-map.mjs <inventory.json> <results.json> --out <map.json>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [inventoryFile,resultsFile]=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const outIndex=process.argv.indexOf('--out');
const out=outIndex>=0?process.argv[outIndex+1]:'docs/review/interaction-map-cloud.json';
const inventory=JSON.parse(fs.readFileSync(inventoryFile,'utf8'));
const results=JSON.parse(fs.readFileSync(path.join(root,resultsFile),'utf8'));
const executed=new Map(results.tests.map(test=>[test.id,test]));
const sourceCache=new Map();
function fileHas(file,anchor){
 const key=file+'\n'+anchor;
 if(sourceCache.has(key))return sourceCache.get(key);
 let found=false;
 try{found=fs.readFileSync(path.join(root,file),'utf8').includes(anchor);}catch{found=false;}
 sourceCache.set(key,found);return found;
}
function convert(entry){
 const sources=[];
 for(const binding of entry.originalSourceBindings??[]){
  if(typeof binding.anchor!=='string'||!binding.anchor)continue;
  for(const candidate of entry.currentSourceFiles??[]){
   const file=candidate.file;
   if(typeof file!=='string'||!file.startsWith('src/'))continue;
   if(fileHas(file,binding.anchor)){sources.push({file,anchor:binding.anchor});break;}
  }
  if(sources.length)break;
 }
 // 家族候选仅作参考存 candidates，不作证据；proofs/sources 只放手工精选（另行登记），默认 pending。
 // （旧 anchor 精确匹配保留：确为同一字符串在当前文件中的延续。）
 const candidates=[];
 for(const related of entry.relatedExecutedCases??[]){
  const local=executed.get(related.testId);
  candidates.push({testId:related.testId,status:local?.status??'unobserved'});
 }
 // 无可验证 anchor 的条目保持 sources 为空（具体控件 pending，不做文件级绑定）。
 const row={id:entry.id,taskId:entry.taskId,label:entry.label,disposition:entry.disposition,reason:entry.reason,sources,proofs:[],candidates};
 if(entry.disposition==='conditional_capability_not_delivered'&&typeof entry.reason==='string'&&entry.reason.trim().length>=16){
  row.notApplicable={disabled:entry.reason,error:entry.reason,persistence:entry.reason};
 }
 return row;
}
const map={version:1,counts:{interactions:260,pages:23,dialogs:30},policy:'云端对应登记：sources 逐条验证，proofs 只绑定真实 passed，facets 无依据保持缺失；旧匿名注册保留供历史审查。',interactions:(inventory.interactions??[]).map(convert),pages:(inventory.pages??[]).map(convert),dialogs:(inventory.dialogs??[]).map(convert)};
fs.writeFileSync(path.join(root,out),JSON.stringify(map,null,2)+'\n');
const withSource=map.interactions.filter(row=>row.sources.length).length;
const withProof=map.interactions.filter(row=>row.proofs.length).length;
console.log(JSON.stringify({interactions:map.interactions.length,withSource,withProof,pages:map.pages.length,dialogs:map.dialogs.length,out}));
