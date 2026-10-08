import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import {build} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envDir=path.join(root,'work/account-api-cloud/task3-empty-env'),outDir=path.join(root,'work/account-api-cloud/task3-build');
await mkdir(envDir,{recursive:true});
await build({root,configFile:path.join(root,'vite.config.ts'),envDir,build:{outDir,emptyOutDir:false}});
const assets=path.join(outDir,'assets'),files=[];for(const file of await readdir(assets)){if(file.endsWith('.js'))files.push({file,bytes:(await stat(path.join(assets,file))).size});}
const thresholdBytes=500000,oversized=files.filter(file=>file.bytes>thresholdBytes),report={scope:'Task3 local review build; empty env directory; no deployment',thresholdBytes,files,oversized,passed:files.length>0&&oversized.length===0};
await writeFile(path.join(root,'work/account-api-cloud/task3-build-budget.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
