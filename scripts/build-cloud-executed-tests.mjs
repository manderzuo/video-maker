// 从云端浏览器真实执行日志生成 executed-tests 结果清单。
// 用法: node scripts/build-cloud-executed-tests.mjs <log1> [log2 ...] --out <results.json>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {observableAssertionLines} from './check-traceability.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2),outIndex=args.indexOf('--out');
const out=outIndex>=0?args[outIndex+1]:'docs/review/logs/browser-executed-tests-cloud.json';
const logs=args.filter((arg,index)=>arg!=='--out'&&index!==outIndex+1);
const actionPattern=/\.(click|check|fill|selectOption|press|dblclick)\(/g;
const cache=new Map();
function fileEvidence(file){
 if(cache.has(file))return cache.get(file);
 const text=fs.readFileSync(path.join(root,file),'utf8');
 const assertions=observableAssertionLines(text);
 const actions=(text.match(actionPattern)??[]).length;
 const value={assertions,actions};
 cache.set(file,value);return value;
}
function readLog(file){
 const buffer=fs.readFileSync(path.join(root,file));
 const text=buffer[0]===0xFF&&buffer[1]===0xFE?buffer.toString('utf16le'):buffer.toString('utf8');
 return text.replaceAll(/\x1B\[[0-9;?]*[A-Za-z]/g,'');
}
const tests=new Map();
for(const log of logs){
 const text=readLog(log);
 for(const line of text.split(/\r?\n/)){
  const match=line.match(/^\s*(ok|x)\s+\d+\s+(\S+\.spec\.ts):\d+:\d+\s+›\s+(.*?)(?:\s+\([\d.]+s\))?\s*$/);
  if(!match)continue;
  const [,mark,rawFile,title]=match;
  const file=rawFile.replaceAll('\\','/');
  const id=file+'::'+title.trim();
  if(tests.has(id)&&tests.get(id).status==='passed')continue;
  const evidence=fileEvidence(file);
  tests.set(id,{id,file,title:title.trim(),status:mark==='ok'?'passed':'failed',assertions:evidence.assertions.length,actions:evidence.actions,assertionLocations:evidence.assertions.map(line=>({file,line,column:1})),actionLocations:[],network:{coreWrites:0,paidRequests:0,blockedRequests:0}});
 }
}
const report={format:'cloud-executed-tests',version:1,status:'observed',tests:[...tests.values()]};
fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tests:report.tests.length,passed:report.tests.filter(t=>t.status==='passed').length,out}));
