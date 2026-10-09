// 合并真实 reporter 结果（按 id 去重，新覆盖旧）+ 精确登记 Z-02/Z-03/D-19。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cloudFile=path.join(root,'docs/review/logs/browser-executed-tests-cloud.json');
const cloud=JSON.parse(fs.readFileSync(cloudFile,'utf8'));
const purge=JSON.parse(fs.readFileSync(path.join(root,'work/account-api-cloud/purge-executed.json'),'utf8'));
const merged=new Map(cloud.tests.map(test=>[test.id,test]));
for(const test of purge.tests)merged.set(test.id,test);
cloud.tests=[...merged.values()];
fs.writeFileSync(cloudFile,JSON.stringify(cloud,null,2)+'\n');
const byId=new Map(cloud.tests.map(test=>[test.id,test]));
function expectLines(test){
 const lines=[...new Set(test.assertionLocations.filter(location=>location.file===test.file).map(location=>location.line))].sort((a,b)=>a-b);
 return lines.slice(0,40);
}
function proofFor(prefix,facets,expectedCoreWrites){
 const test=[...byId.values()].find(test=>test.id.startsWith(prefix)&&test.status==='passed');
 if(!test)return undefined;
 const entry={testId:test.id,facets,assertionLines:expectLines(test)};
 if(expectedCoreWrites!==undefined)entry.expectedCoreWrites=expectedCoreWrites;
 if(test.actions)entry.actions=test.actions;
 return {entry,test};
}
const mapFile=path.join(root,'docs/review/interaction-map-cloud.json');
const map=JSON.parse(fs.readFileSync(mapFile,'utf8'));
function setRow(kind,id,sources,specs){
 const row=map[kind].find(row=>row.id===id);
 if(!row){console.log('missing row '+id);return;}
 row.sources=sources;
 row.proofs=[];
 for(const [prefix,facets,expectedCoreWrites] of specs){
  const found=proofFor(prefix,facets,expectedCoreWrites);
  if(found)row.proofs.push(found.entry);
  else console.log('missing proof '+prefix);
 }
}
const page='src/features/workspace/CloudProjectsPage.tsx';
// Z-02 单项永久删除：成功测 normal/sideEffect（收据+零上游），取消/错名测 disabled，
// 未知/刷新重试测 error/persistence。均为该用例真实断言，非家族填充。
setRow('interactions','Z-02',[{file:page,anchor:'data-interaction-id="cloud:project:purge"'},{file:page,anchor:'data-interaction-id="cloud:project:purge-commit"'}],[['tests/e2e/cloud-project-purge.spec.ts::purges a trashed project after exact-name',['normal','sideEffect'],0],['tests/e2e/cloud-project-purge.spec.ts::cancels purge without deleting',['disabled'],undefined],['tests/e2e/cloud-project-purge.spec.ts::replays the same purge key without a second receipt',['error'],undefined],['tests/e2e/cloud-project-purge.spec.ts::retries an unknown single purge after refresh',['error','persistence'],undefined]]);
setRow('interactions','Z-03',[{file:page,anchor:'data-interaction-id="cloud:project:batch-purge"'},{file:page,anchor:'data-interaction-id="cloud:project:purge-batch-commit"'}],[['tests/e2e/cloud-project-purge.spec.ts::purges selected trashed projects one by one',['normal','sideEffect'],0],['tests/e2e/cloud-project-purge.spec.ts::keeps failed batch items retryable',['error','persistence'],undefined],['tests/e2e/cloud-project-purge.spec.ts::restores an unknown batch item after refresh',['error','persistence'],undefined],['tests/e2e/cloud-project-purge.spec.ts::keeps an old unknown batch item recoverable',['error','persistence'],undefined]]);
setRow('dialogs','D19',[{file:'src/ui/dialog-contracts.ts',anchor:"'永久删除项目'"},{file:'src/ui/dialog-contracts.ts',anchor:"'批量永久删除项目'"}].filter(binding=>{try{return fs.readFileSync(path.join(root,binding.file),'utf8').includes(binding.anchor);}catch{return false;}}),[['tests/e2e/cloud-project-purge.spec.ts::purges a trashed project after exact-name',['normal'],undefined],['tests/e2e/cloud-project-purge.spec.ts::purges selected trashed projects one by one',['normal'],undefined]]);
fs.writeFileSync(mapFile,JSON.stringify(map,null,2)+'\n');
console.log('purge entries fixed');
