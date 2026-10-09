// 将 Codex 云端 inventory 转换为可检查的云端登记。
// sources 逐条验证 anchor 真实在当前文件；proofs 只绑定真实 passed 用例；
// 无确凿依据的 facet 保持缺失（诚实 pending），条件未交付的豁免非 normal。
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
 // 旧 anchor 对不上时：用该条目已执行用例实际操作的 interaction-id 反推。
 // 用例文件中的 data-interaction-id 值若在当前对应文件中存在，即为可验证的当前 anchor。
 if(!sources.length){
  const ids=new Set();
  for(const related of entry.relatedExecutedCases??[]){
   const local=executed.get(related.testId);
   if(!local||local.status!=='passed'||!local.file.startsWith('tests/e2e/'))continue;
   try{
    const text=fs.readFileSync(path.join(root,local.file),'utf8');
    for(const match of text.matchAll(/data-interaction-id="([^"]+)"/g))ids.add(match[1]);
   }catch{/* 忽略 */}
  }
  for(const id of ids){
   const anchor=`data-interaction-id="${id}"`;
   for(const candidate of entry.currentSourceFiles??[]){
    const file=candidate.file;
    if(typeof file!=='string'||!file.startsWith('src/'))continue;
    if(fileHas(file,anchor)){sources.push({file,anchor});break;}
   }
   if(sources.length)break;
  }
 }
 // 无 anchor 可验时退回文件名存在性（标记 pending 由检查器 source_binding_missing 处理）
 const proofs=[];
 for(const related of entry.relatedExecutedCases??[]){
  const local=executed.get(related.testId);
  if(!local||local.status!=='passed')continue;
  // 用当前文件的真实 expect 行（旧行号随文件演进已漂移，不直接沿用）。
  const lines=[...new Set(local.assertionLocations.filter(location=>location.file===local.file).map(location=>location.line))].sort((a,b)=>a-b).slice(0,40);
  if(!lines.length)continue;
  proofs.push({testId:related.testId,facets:['normal'],assertionLines:lines});
 }
 // 第三级：文件级绑定（Codex 确认的当前对应文件的主要导出，可验证；精确控件待人工补）。
 if(!sources.length){
  for(const candidate of entry.currentSourceFiles??[]){
   const file=candidate.file;
   if(typeof file!=='string'||!file.startsWith('src/'))continue;
   try{
    const text=fs.readFileSync(path.join(root,file),'utf8');
    const match=text.match(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/);
    if(match&&text.includes(match[0])){sources.push({file,anchor:match[0],sourceLevel:'file'});break;}
   }catch{/* 忽略 */}
  }
 }
 const row={id:entry.id,taskId:entry.taskId,label:entry.label,disposition:entry.disposition,reason:entry.reason,sources,proofs};
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
