import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const legalTexts=['THIRD_PARTY_NOTICES.txt','licenses/infinite-canvas.LICENSE','licenses/prompt-for-seedance-gptimage2.5.LICENSE','licenses/fflate-0.8.2.LICENSE'].map(file=>fs.readFileSync('third-party/'+file,'utf8').replaceAll('\r\n','\n'));
function legalDataOnly(text){
 const file=ts.createSourceFile('legal.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),values=[];
 for(const statement of file.statements){if(ts.isExportDeclaration(statement)&&!statement.moduleSpecifier)continue;if(!ts.isVariableStatement(statement))return false;for(const declaration of statement.declarationList.declarations){const value=declaration.initializer;if(!value||!ts.isStringLiteral(value)&&!ts.isNoSubstitutionTemplateLiteral(value))return false;values.push(value.text.replaceAll('\r\n','\n'));}}
 return values.length>0&&values.length<=legalTexts.length&&values.every(value=>legalTexts.includes(value));
}
export function listFiles(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(path.join(root,entry.name)):[path.join(root,entry.name)]);}
export function scanBrand(root='dist'){
 const unexpected=[],exceptions=[],maps=[],credentialFindings=[];
 for(const file of listFiles(root)){
  if(file.endsWith('.map'))maps.push(file);if(!/\.(?:js|css|html|json)$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8'),basename=path.basename(file);
  if(/sourceMappingURL\s*=/.test(text))maps.push(file);
  for(const match of text.matchAll(/infinite[-_]canvas|AI[_ -]?YouTu|ai[_-]youtu|basketikun|https?:\/\/[^\s"'<>`]*(?:aitu|aiyout|infinite-canvas)[^\s"'<>`]*/gi)){
   const legal=/^legal-notices-/.test(basename)&&legalDataOnly(text),legacy=/^legacy-migration-/.test(basename)&&match[0]==='infinite-canvas'&&/app:[A-Za-z_$][\w$]*(?:\.literal)?\(["']infinite-canvas["']\),version:/.test(text.slice(Math.max(0,match.index-30),match.index+30));
   (legal||legacy?exceptions:unexpected).push({file,value:match[0],offset:match.index,reason:legal?'explicit copyright/license text only':legacy?'explicit isolated legacy import format':'normal product code'});
  }
  if(/STUDIO_T47_CREDENTIAL_DO_NOT_EXPORT|sk-(?:live|proj)-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~-]{16,}/.test(text))credentialFindings.push(file);
 }
 return {passed:unexpected.length===0&&maps.length===0&&credentialFindings.length===0,normalInterfaceFindings:unexpected,legalAndMigrationExceptions:exceptions,sourceMaps:maps,credentialFindings,frontendMarkAuthorization:'unresolved',formalReleaseApproved:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const report=scanBrand(process.argv[2]??'dist');fs.mkdirSync('docs/review/logs',{recursive:true});fs.writeFileSync('docs/review/logs/T47-brand-scan.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=report.passed?0:1;}
