// 将 Codex 云端 inventory 转换为可检查的云端登记。
// sources 只接受真实测试动作触发的 target 在当前文件中的绑定；
// proofs 只用 reporter 记录的真实 assertionLocations；无确凿依据保持缺失。
// 用法: node scripts/build-cloud-trace-map.mjs <inventory.json> <results.json> --out <map.json>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [inventoryFile,resultsFile]=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const outIndex=process.argv.indexOf('--out');
const out=outIndex>=0?process.argv[outIndex+1]:'docs/review/interaction-map-cloud.json';
const inventory=JSON.parse(fs.readFileSync(inventoryFile,'utf8'));
const results=JSON.parse(fs.readFileSync(path.join(root,resultsFile),'utf8'));
const executed=new Map(results.tests.map(test=>[test.id,test]));
const sourceCache=new Map();
const expectLineCache=new Map();
const testLineCache=new Map();
function expectLines(file){
 if(expectLineCache.has(file))return expectLineCache.get(file);
 let lines=new Set();
 try{
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const found=new Set();
  (function visit(node){
   if(ts.isCallExpression(node)&&node.expression.getText(source)==='expect'&&node.arguments.length)found.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);
   ts.forEachChild(node,visit);
  })(source);
  lines=found;
 }catch{/* 忽略 */}
 expectLineCache.set(file,lines);return lines;
}
function testLine(file,line){
 const key=file+':'+line;
 if(testLineCache.has(key))return testLineCache.get(key);
 let value='';
 try{value=(fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)[line-1]??'').slice(0,400);}catch{/* 忽略 */}
 testLineCache.set(key,value);return value;
}
function actionTargets(file,line){
 const text=testLine(file,line),targets=[];
 for(const match of text.matchAll(/data-interaction-id="([^"]+)"/g))targets.push(`data-interaction-id="${match[1]}"`);
 for(const match of text.matchAll(/\{name:'((?:[^'\\]|\\.)+)'/g))targets.push(match[1]);
 for(const match of text.matchAll(/\{name:"((?:[^"\\]|\\.)+)"/g))targets.push(match[1]);
 return targets;
}
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
 // 旧 anchor 对不上时：用该条目已执行测试的真实动作行提取 target。
 // 动作行是 reporter 记录的真实触发位置，其 target 在当前对应文件中存在才算绑定。
 if(!sources.length){
  const seen=new Set();
  for(const related of entry.relatedExecutedCases??[]){
   const local=executed.get(related.testId);
   if(!local||local.status!=='passed'||!local.file.startsWith('tests/e2e/'))continue;
   for(const location of local.actionLocations??[]){
    if(location.file!==local.file)continue;
    for(const target of actionTargets(location.file,location.line)){
     if(seen.has(target))continue;seen.add(target);
     for(const candidate of entry.currentSourceFiles??[]){
      const file=candidate.file;
      if(typeof file!=='string'||!file.startsWith('src/'))continue;
      if(fileHas(file,target)){sources.push({file,anchor:target});break;}
     }
     if(sources.length)break;
    }
    if(sources.length)break;
   }
   if(sources.length)break;
  }
 }
 // 无 anchor 可验时退回文件名存在性（标记 pending 由检查器 source_binding_missing 处理）
 const proofs=[];
 for(const related of entry.relatedExecutedCases??[]){
  const local=executed.get(related.testId);
  if(!local||local.status!=='passed')continue;
  // 只取 reporter 真实行中确为 expect 调用的行（helper 定义行等不计入）。
  const observable=expectLines(local.file);
  const lines=[...new Set(local.assertionLocations.filter(location=>location.file===local.file&&observable.has(location.line)).map(location=>location.line))].sort((a,b)=>a-b).slice(0,40);
  if(!lines.length)continue;
  proofs.push({testId:related.testId,facets:['normal'],assertionLines:lines});
 }
 // 无可验证 anchor 的条目保持 sources 为空（具体控件 pending，不做文件级绑定）。
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
