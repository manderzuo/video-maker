import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function collectRuntimeLicenses(){
 const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8')),records=[];
 for(const [entry,pkg] of Object.entries(lock.packages)){
  if(!entry.startsWith('node_modules/')||pkg.dev||pkg.devOptional)continue;
  const name=entry.slice('node_modules/'.length),source=['LICENSE','LICENSE.md','LICENSE.txt','license','license.md'].map(file=>path.join(entry,file)).find(file=>fs.existsSync(file));if(!source)throw Error('runtime_license_missing:'+name);
  const bytes=fs.readFileSync(source),target='third-party/licenses/runtime-'+name.replace(/[@/]/g,'_')+'-'+pkg.version+'.LICENSE';if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==hash(bytes))throw Error('existing_license_differs:'+target);fs.writeFileSync(target,bytes);records.push({name,version:pkg.version,license:pkg.license,source,target,sha256:hash(bytes)});
 }
 fs.writeFileSync('third-party/runtime-licenses.json',JSON.stringify({records},null,2)+'\n');return records;
}
export function scanLicenses(licenseRoot='third-party'){
 const records=JSON.parse(fs.readFileSync('third-party/runtime-licenses.json','utf8')).records,missing=[],modified=[],preserved=[];
 for(const record of records){const target=path.join(licenseRoot,record.target.slice('third-party/'.length));if(!fs.existsSync(target))missing.push(record.target);else if(hash(fs.readFileSync(target))!==record.sha256)modified.push(record.target);else preserved.push({file:record.target,sha256:record.sha256});}
 for(const relative of ['THIRD_PARTY_NOTICES.txt','licenses/infinite-canvas.LICENSE','licenses/prompt-for-seedance-gptimage2.5.LICENSE','licenses/infinite-canvas.docs_content_docs_business_license.mdx','licenses/infinite-canvas.docs_content_docs_business_license.zh-CN.mdx','licenses/infinite-canvas..agents_skills_frontend-design_LICENSE.txt']){const expected=path.join('third-party',relative),target=path.join(licenseRoot,relative);if(!fs.existsSync(target))missing.push(relative);else if(hash(fs.readFileSync(target))!==hash(fs.readFileSync(expected)))modified.push(relative);else preserved.push({file:expected,sha256:hash(fs.readFileSync(target))});}
 return {preservedAll:missing.length===0&&modified.length===0,missing,modified,preserved,frontendMarkAuthorization:'unresolved',releaseAllowed:false,reason:'Pinned upstream README/frontend mark exception remains pending human clarification; source reference repositories without licenses have not been copied into product.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.includes('--collect'))collectRuntimeLicenses();const report=scanLicenses();fs.mkdirSync('docs/review/logs',{recursive:true});fs.writeFileSync('docs/review/logs/T47-license-scan.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=report.preservedAll&&(process.argv.includes('--offline-review')||report.releaseAllowed)?0:1;}
