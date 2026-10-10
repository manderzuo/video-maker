import ts from 'typescript';
import {createHash} from 'node:crypto';
import {observableAssertionLines} from './check-traceability.mjs';

const parse=text=>ts.createSourceFile('input.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function walk(node,visit){visit(node);ts.forEachChild(node,child=>walk(child,visit));}
export function migrationReferences(text){
 const names=[];
 walk(parse(text),node=>{if(ts.isStringLiteral(node))for(const name of node.text.match(/\d{3}-[a-z0-9-]+\.sql/g)??[])names.push(name);});
 return [...new Set(names)].sort();
}
export function packageMigrations(text){
 const names=[];
 walk(parse(text),node=>{if(ts.isVariableDeclaration(node)&&node.name.getText()==='migrationNames'&&node.initializer&&ts.isArrayLiteralExpression(node.initializer))for(const item of node.initializer.elements){if(!ts.isStringLiteral(item))throw Error('nonliteral_package_migration');names.push(item.text);}});
 return names;
}
// Strip comments and quoted data before testing SQL syntax. A comment, string or
// dollar-quoted function body mentioning CREATE TABLE is not migration DDL.
export function containsMigrationDdl(sql){
 let out='',index=0;
 while(index<sql.length){
  if(sql.startsWith('--',index)){index=sql.indexOf('\n',index);if(index<0)break;out+=' ';continue;}
  if(sql.startsWith('/*',index)){let depth=1;index+=2;while(index<sql.length&&depth){if(sql.startsWith('/*',index)){depth++;index+=2;}else if(sql.startsWith('*/',index)){depth--;index+=2;}else index++;}out+=' ';continue;}
  const quote=sql[index];
  if(quote==="'"||quote==='"'){index++;while(index<sql.length){if(sql[index]===quote){index++;if(sql[index]===quote){index++;continue;}break;}index++;}out+=' identifier ';continue;}
  const dollar=sql.slice(index).match(/^\$(?:[A-Za-z_][\w]*)?\$/)?.[0];
  if(dollar){const end=sql.indexOf(dollar,index+dollar.length);index=end<0?sql.length:end+dollar.length;out+=' ';continue;}
  out+=sql[index++];
 }
 return /\b(?:CREATE|ALTER)\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\b/i.test(out);
}
export function validateRegisteredEvidence({report,map,readSource}){
 const errors=[],results=new Map(),cache=new Map();
 const source=file=>{if(!cache.has(file)){const text=readSource(file),ast=parse(text),cases=new Map();walk(ast,node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='test'&&node.arguments.length>1&&ts.isStringLiteral(node.arguments[0])){const body=node.arguments.at(-1);cases.set(node.arguments[0].text,{start:ast.getLineAndCharacterOfPosition(body.getStart(ast)).line+1,end:ast.getLineAndCharacterOfPosition(body.end).line+1});}});cache.set(file,{text,hash:createHash('sha256').update(text).digest('hex'),cases,assertions:new Set(observableAssertionLines(text))});}return cache.get(file);};
 if(report.format!=='aiwork-studio-executed-test-evidence'||report.status!=='passed')errors.push('report_not_passed');
 for(const result of report.tests??[]){
  if(results.has(result.id))errors.push('duplicate_test:'+result.id);
  results.set(result.id,result);
  try {
   if(!result.file?.startsWith('tests/e2e/')||result.status!=='passed')throw Error('test_not_passed');
   const current=source(result.file),title=result.id.slice((result.file+'::').length),body=current.cases.get(title);
   if(result.id!==result.file+'::'+title||!body)throw Error('test_not_declared');
   if(result.sourceHash!==current.hash)throw Error('source_hash_stale');
   if(!result.assertions||!result.assertionLocations?.some(location=>location.file===result.file&&location.line>=body.start&&location.line<=body.end&&current.assertions.has(location.line)))throw Error('observable_assertion_missing');
  }catch(error){errors.push(error.message+':'+result.id);}
 }
 let proofCount=0;
 for(const [kind,rows] of Object.entries(map)){
  if(!['interactions','pages','dialogs'].includes(kind))continue;
  for(const row of rows){
   for(const binding of row.sources??[])try{if(!binding.file?.startsWith('src/')||!binding.anchor||!readSource(binding.file).includes(binding.anchor))throw Error('source_binding_missing');}catch{errors.push('source_binding_missing:'+row.id);}
   for(const proof of row.proofs??[]){proofCount++;
    try {
     const result=results.get(proof.testId);if(!result||result.status!=='passed')throw Error('proof_test_missing');
     const current=source(result.file);if(proof.sourceHash!==result.sourceHash||proof.sourceHash!==current.hash)throw Error('proof_hash_stale');
     if(!row.sources?.length)throw Error('proof_source_unbound');
     if(kind==='interactions'&&!result.actions)throw Error('proof_action_missing');
     if(!proof.assertionLines?.length||!proof.assertionLines.every(line=>current.assertions.has(line)&&result.assertionLocations?.some(location=>location.file===result.file&&location.line===line)))throw Error('proof_assertion_unobserved');
     if(!proof.facets?.length)throw Error('proof_facet_missing');
     if(proof.facets.includes('sideEffect')&&(!Number.isSafeInteger(proof.expectedCoreWrites)||result.network?.coreWrites!==proof.expectedCoreWrites||result.network?.blockedRequests!==0))throw Error('proof_network_unobserved');
    }catch(error){errors.push(error.message+':'+row.id);}
   }
  }
 }
 if(!proofCount)errors.push('no_registered_proofs');
 return {valid:errors.length===0,errors,proofCount,executed:results.size};
}
