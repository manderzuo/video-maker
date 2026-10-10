// 刷新云端登记中所有 proofs 的断言行（spec 演进导致行号漂移后重对齐）。
// 只更新行号，不增删绑定；新绑定另行登记。
// 拒绝过期报告：proof 的测试文件若在报告生成后被修改（mtime 新于报告），跳过并警告，不静默筛旧行。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resultsPath=path.join(root,'docs/review/logs/browser-executed-tests-cloud.json');
const resultsMtime=fs.statSync(resultsPath).mtimeMs;
const results=JSON.parse(fs.readFileSync(resultsPath,'utf8')).tests;
const byId=new Map(results.map(t=>[t.id,t]));
const map=JSON.parse(fs.readFileSync(path.join(root,'docs/review/interaction-map-cloud.json'),'utf8'));
const cache=new Map();
function observable(file){
 if(cache.has(file))return cache.get(file);
 const text=fs.readFileSync(path.join(root,file),'utf8');
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const found=new Set();
 (function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='expect'&&node.arguments.length)found.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);
  ts.forEachChild(node,visit);
 })(source);
 cache.set(file,found);return found;
}
let refreshed=0;const stale=[];
for(const row of [...map.interactions,...map.pages,...map.dialogs]){
 for(const proof of row.proofs??[]){
  const result=byId.get(proof.testId);
  if(!result||result.status!=='passed')continue;
  try{
   if(fs.statSync(path.join(root,result.file)).mtimeMs>resultsMtime){stale.push(proof.testId.slice(0,60));continue;}
  }catch{stale.push(proof.testId.slice(0,60));continue;}
  const obs=observable(result.file);
  proof.assertionLines=[...new Set(result.assertionLocations.filter(l=>l.file===result.file&&obs.has(l.line)).map(l=>l.line))].sort((a,b)=>a-b).slice(0,40);
  refreshed++;
 }
}
fs.writeFileSync(path.join(root,'docs/review/interaction-map-cloud.json'),JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({refreshed,stale}));
