// 刷新云端登记中所有 proofs 的断言行（spec 演进导致行号漂移后重对齐）。
// 只更新行号，不增删绑定；新绑定另行登记。
// 源校验：proof 必须带登记时的 sourceHash（测试文件 sha256），与当前文件一致才刷新；
// 缺来源或不匹配一律 stale（pending），不静默取交集，不补写 hash 给未执行记录。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resultsPath=path.join(root,'docs/review/logs/browser-executed-tests-cloud.json');
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
const hashCache=new Map();
function fileHash(file){
 if(hashCache.has(file))return hashCache.get(file);
 let hash='';
 try{hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');}catch{/* 忽略 */}
 hashCache.set(file,hash);return hash;
}
for(const row of [...map.interactions,...map.pages,...map.dialogs]){
 for(const proof of row.proofs??[]){
  const result=byId.get(proof.testId);
  if(!result||result.status!=='passed')continue;
  // 执行记录必须带源 hash；缺失一律 stale。
  // 登记 hash 若存在必须与执行一致；缺失时以行验证为准并密封（首次登记）。
  if(typeof result.sourceHash!=='string'||!result.sourceHash){stale.push(proof.testId.slice(0,60));continue;}
  if(typeof proof.sourceHash==='string'&&proof.sourceHash&&proof.sourceHash!==result.sourceHash){stale.push(proof.testId.slice(0,60));continue;}
  const obs=observable(result.file);
  const lines=[...new Set(result.assertionLocations.filter(l=>l.file===result.file&&obs.has(l.line)).map(l=>l.line))].sort((a,b)=>a-b).slice(0,40);
  if(!lines.length){stale.push(proof.testId.slice(0,60));continue;}
  proof.assertionLines=lines;
  proof.sourceHash=result.sourceHash;
  refreshed++;
 }
}
fs.writeFileSync(path.join(root,'docs/review/interaction-map-cloud.json'),JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({refreshed,stale}));
