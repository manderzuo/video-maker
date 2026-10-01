import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {zipSync} from 'fflate';
import {listFiles,scanBrand} from './check-brand.mjs';
import {scanLicenses} from './check-license.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function packageRelease({outputDir='artifacts',offlineReview=false}={}){
 const brand=scanBrand(),license=scanLicenses();if(!brand.passed||!license.preservedAll)throw Error('distribution_scan_failed');if(!offlineReview&&!license.releaseAllowed)throw Error('frontend_mark_release_gate_unresolved');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirtySources=execFileSync('git',['status','--porcelain','--','src','scripts','deploy','companion','vite.config.ts','package.json','package-lock.json'],{encoding:'utf8'}).trim();
 if(!offlineReview&&dirtySources)throw Error('formal_release_requires_committed_sources');
 const entries={},add=file=>{entries[file.replaceAll('\\','/')]=new Uint8Array(fs.readFileSync(file));};
 for(const directory of ['dist','third-party','companion/dist'])for(const file of listFiles(directory)){if(file.endsWith('.map'))throw Error('source_map_in_distribution');add(file);}
 for(const file of ['scripts/serve-local.mjs','scripts/start-canvas.ps1','scripts/start-companion.ps1','src/adapters/core/route-policy.ts','deploy/canvas-runtime.example.json','deploy/nginx-canvas.conf','docs/deployment.md','docs/integrations/mcp.md'])add(file);
 entries['package.json']=new TextEncoder().encode(JSON.stringify({name:'aiwork-studio-offline-review',private:true,type:'module',engines:{node:'>=22.18.0 <23'}}));
 const files=Object.entries(entries).map(([file,bytes])=>({file,bytes:bytes.length,sha256:sha(bytes)})),sourceTreeSha256=sha(JSON.stringify(files));
 const manifest={format:'aiwork-studio-distribution',schemaVersion:1,kind:offlineReview?'offline-review':'release',sourceCommit,sourceTreeSha256,dirtySources:!!dirtySources,createdAt:new Date().toISOString(),files,formalReleaseApproved:false,liveVerified:false,userAccepted:false,independentReviewPerformed:false,frontendMarkAuthorization:'unresolved',coreConfigured:false};
 entries['distribution-manifest.json']=new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n');
 const zip=zipSync(entries,{level:6}),sha256=sha(zip),filename='aiwork-studio-offline-review-'+sourceCommit.slice(0,7)+'-'+sha256.slice(0,12)+'.zip';fs.mkdirSync(outputDir,{recursive:true});const output=path.join(outputDir,filename);if(fs.existsSync(output)&&sha(fs.readFileSync(output))!==sha256)throw Error('existing_archive_differs');fs.writeFileSync(output,zip);fs.writeFileSync(output+'.sha256',sha256+'  '+filename+'\n');
 return {output,sha256,bytes:zip.length,manifest,brand,license,releaseAllowed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const result=packageRelease({offlineReview:process.argv.includes('--offline-review')});fs.writeFileSync('docs/review/logs/T47-distribution-package.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output:result.output,sha256:result.sha256,bytes:result.bytes,kind:result.manifest.kind,sourceCommit:result.manifest.sourceCommit,dirtySources:result.manifest.dirtySources,releaseAllowed:result.releaseAllowed}));}
