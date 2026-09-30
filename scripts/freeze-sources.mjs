import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertProjectWritePath } from './source-policy.mjs';
const root = process.cwd();
assertProjectWritePath(root, 'docs/review/source-manifest.json');
const sources = [
 ['basketikun/infinite-canvas','dab19adc0847e32e39b7fc8ff90cb392561fb826','infinite-canvas','canvas algorithms only; UI/providers/storage/remote plugins excluded'],
 ['manderzuo/Trae-core','c056dffc41c701fb1b78a84c18c2ec139d3d708b','Trae-core','public contract reference only; finance/admin/internal bridge excluded'],
 ['manderzuo/trae-maker','d97904db990485072d50a9065ed9dca58e222b0c','trae-maker','execution boundary reference only; no Electron/Tauri/account/UI migration'],
 ['manderzuo/trae-maker-MCP','9e7d5c8f249bfc65265c9f90260cd1e350280557','trae-maker-MCP','protocol semantics reference only; no DPAPI configuration or credential access'],
 ['manderzuo/prompt-for-seedance-gptimage2.5','d8ba7c104ba7c24e3d28b0c3bede8764544bea8b','prompt-for-seedance-gptimage2.5','video pure rules candidate; no Electron IPC/http/gallery/payment/image compiler']
];
mkdirSync('third-party/licenses',{recursive:true});
mkdirSync('docs/review/sources',{recursive:true});
let notices = 'AI WORK Studio — source provenance and third-party notices\n\nNo product source code has been migrated in T01. The following snapshots are read-only references. Copyright holders remain unchanged. This file does not resolve frontend-mark authorization.\n\n';
const manifest = {version:1, target:{relativePath:'TRAEWORK/aiwork-studio',absolutePath:root,authorizedParent:'E:\\trae-studio',resolvedPathEvidence:'docs/review/workspace-check.md',writable:true}, model:{requested:'GPT6.1 sol high',actual:'由用户在宿主选择，当前工具不可验证',verified:false}, networkPolicy:'public source downloads only; no Core/gateway/model business calls', remote:null, sources:[]};
for (const [repo,sha,name,disposition] of sources) {
 const snapshotPath=resolve('E:/trae-studio/sources',`${name}-${sha.slice(0,7)}`);
 const git=(...args)=>execFileSync('git',['-C',snapshotPath,...args],{encoding:'utf8'}).trim();
 const actual=git('rev-parse','HEAD'); if(actual!==sha) throw Error(`${name}: incorrect commit`);
 const paths=git('ls-tree','-r','--name-only',sha).split('\n');
 writeFileSync(`docs/review/sources/${name}.paths.txt`,paths.join('\n')+'\n');
 const licenses=paths.filter(p=>/(^|\/)(LICENSE(?:\.[^/]+)?|COPYING(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?)$/i.test(p));
 const evidence=[resolve(snapshotPath,'README.md')];
 notices += `${repo} @ ${sha}\nRepository: https://github.com/${repo}/tree/${sha}\nDisposition: ${disposition}\n`;
 for(const path of licenses){
   const dest=`third-party/licenses/${name}.${path.replaceAll('/','_')}`;
   copyFileSync(resolve(snapshotPath,path),dest); evidence.push(resolve(dest));
   notices += `\nVerbatim ${path}:\n${readFileSync(resolve(snapshotPath,path),'utf8')}\n`;
 }
 if(!licenses.length) notices += 'No root or nested LICENSE/COPYING/NOTICE found in tracked filename inventory. Permission is unresolved; no code copying authorized by this record.\n';
 if(name==='infinite-canvas') notices += 'README.md line 30 requests preservation of original author and frontend marks. Release gate unresolved; UI design approval is not an additional license.\n';
 notices+='\n';
 manifest.sources.push({repository:repo,url:`https://github.com/${repo}/tree/${sha}`,commit:sha,actualCommit:actual,snapshotPath,snapshotRelativePath:`../../sources/${name}-${sha.slice(0,7)}`,snapshotStatus:'verified',workingTreeClean:git('status','--porcelain')==='',readOnlyAccessPolicy:true,productCodeMigrated:false,reuseDisposition:disposition,license:{status:licenses.length?'license-text-retained':'not-found-permission-unresolved',evidencePaths:evidence,frontendMarkReleaseGate:name==='infinite-canvas'?'unresolved':'not-applicable'},trackedFileCount:paths.length,pathInventory:`docs/review/sources/${name}.paths.txt`,fullStaticScan:'not performed',upstreamBuild:'not performed',upstreamTests:'not performed'});
}
writeFileSync('third-party/THIRD_PARTY_NOTICES.txt',notices);
writeFileSync('docs/review/source-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const rows=[
 ['infinite-canvas','web/src/lib/canvas/canvas-node-geometry.ts','T13/T15','candidate-selective-adaptation','bounds/group geometry; remap to domain commands; no second engine'],
 ['infinite-canvas','web/src/lib/canvas/canvas-node-size.ts','T14','candidate-selective-adaptation','replace dimensions with approved tokens'],
 ['infinite-canvas','web/src/components/canvas/canvas-connections.tsx','T13/T14','candidate-not-yet-reviewed','inspect interactions before migration; UI rewritten'],
 ['infinite-canvas','web/src/stores/canvas/use-canvas-store.ts','T05/T10','excluded','new native IndexedDB transactions and command layer'],
 ['infinite-canvas','web/src/components/layout/app-config-modal.tsx','T11/T37','excluded','new owned UI; remove default providers/plugin/script paths'],
 ['Trae-core','starlink-dimension-router/src/server.rs','T23','contract-reference-only','ordinary user routes; no live requests'],
 ['trae-maker','src-tauri/src/api_server/auth.rs','T23','reference-only','Core remains authorization authority; gateway not directly called'],
 ['trae-maker-MCP','skills/aiwork-seedance/mcp/README.md','T39/T41','protocol-reference-only','do not migrate credentials or installer'],
 ['prompt-for-seedance-gptimage2.5','src/optimizer/videoRules.js','T18/T19','candidate-selective-adaptation','preserve pure rules; reject defaults overriding explicit constraints'],
 ['prompt-for-seedance-gptimage2.5','electron/main.cjs','T18/T30','prompt-concept-reference-only','no Electron credentials or HTTP implementation migrated']
];
let csv='repository,commit,sourcePath,sourceSha256,targetTask,disposition,notes\n';
for(const [name,path,task,status,notes] of rows){const source=manifest.sources.find(s=>s.repository.endsWith('/'+name));const bytes=readFileSync(resolve(source.snapshotPath,path));csv += [source.repository,source.commit,path,createHash('sha256').update(bytes).digest('hex'),task,status,notes].map(x=>'"'+x.replaceAll('"','""')+'"').join(',')+'\n';}
writeFileSync('docs/review/reuse-ledger.csv',csv);
console.log(`Verified ${sources.length} pinned commits; license inventory and 10 module dispositions recorded.`);
