import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const facets=['normal','disabled','error','persistence','sideEffect'];
const normalize=value=>value?.replaceAll('\\','/');
export function observableAssertionLines(text){
 const source=ts.createSourceFile('evidence.spec.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),lines=new Set();
 function literal(node){return ts.isLiteralExpression(node)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)||ts.isPrefixUnaryExpression(node)&&literal(node.operand);}
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='expect'&&node.arguments.length&&!literal(node.arguments[0]))lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);ts.forEachChild(node,visit);}
 visit(source);return [...lines];
}
export function evaluateTraceability({interactions,pages,dialogs,map,results,verifySource,verifyAssertions,verifySourceHash}){
 const errors=[],rows=[],executed=new Map(results.map(result=>[result.id,result]));
 for(const [kind,canonical] of Object.entries({interactions,pages,dialogs})){
  const entries=map[kind]??[],known=new Set(canonical.map(row=>row.id));
  for(const entry of entries)if(!known.has(entry.id))errors.push({code:'unknown_identity',kind,id:entry.id});
  for(const row of canonical){
   const matches=entries.filter(entry=>entry.id===row.id),issues=[];
   if(matches.length!==1)issues.push(matches.length?'duplicate_identity':'missing_mapping');
   const entry=matches[0],owner=row.task_id??row.task;
   if(entry&&entry.taskId!==owner)issues.push('owner_mismatch');
   if(entry&&verifySource&&!verifySource(entry))issues.push('source_binding_missing');
   const confirmed=new Set();
   for(const proof of entry?.proofs??[]){
    const result=executed.get(proof.testId);
    if(!result||result.status!=='passed'){issues.push('test_not_passed');continue;}
    if(typeof result.sourceHash!=='string'||!result.sourceHash||typeof proof.sourceHash!=='string'||!proof.sourceHash||result.sourceHash!==proof.sourceHash){issues.push('source_hash_mismatch');continue;}
    if(verifySourceHash&&!verifySourceHash(proof,result)){issues.push('source_hash_stale');continue;}
    if(!result.assertions||!proof.assertionLines?.length){issues.push('assertion_missing');continue;}
    const assertionLines=result.assertionLocations?.filter(location=>normalize(location.file)===normalize(result.file)).map(location=>location.line)??[];
    if(!proof.assertionLines.every(line=>assertionLines.includes(line))){issues.push('assertion_not_executed');continue;}
    if(verifyAssertions&&!verifyAssertions(proof,result)){issues.push('assertion_not_observable');continue;}
    if(kind==='interactions'&&!result.actions&&entry.disposition!=='conditional'){issues.push('action_missing');continue;}
    if(proof.facets?.includes('sideEffect')){if(!result.network||!Number.isSafeInteger(proof.expectedCoreWrites)){issues.push('network_evidence_missing');continue;}if(result.network.coreWrites!==proof.expectedCoreWrites||result.network.blockedRequests!==0){issues.push('unexpected_network_side_effect');continue;}}
    for(const facet of proof.facets??[])if(facets.includes(facet))confirmed.add(facet);else issues.push('unknown_facet');
   }
   const required=kind==='interactions'?facets:['normal'];
   for(const facet of required){
    const exemption=entry?.notApplicable?.[facet];
    if(exemption){
     if(facet==='normal'||facet==='sideEffect'||typeof exemption!=='string'||exemption.trim().length<16)issues.push('invalid_exemption');
    }else if(!confirmed.has(facet))issues.push('facet_missing:'+facet);
   }
   if(entry?.disposition==='conditional'&&(!confirmed.has('disabled')||!confirmed.has('sideEffect')))issues.push('conditional_gate_unproven');
   const unique=[...new Set(issues)];
   rows.push({id:row.id,kind,taskId:owner,status:unique.length?'incomplete':'self_check_passed',proofs:entry?.proofs??[],missing:unique});
   for(const code of unique)errors.push({code,kind,id:row.id});
  }
 }
 return {complete:errors.length===0,errors,interactions:rows.filter(row=>row.kind==='interactions'),pages:rows.filter(row=>row.kind==='pages'),dialogs:rows.filter(row=>row.kind==='dialogs'),summary:{interactions:interactions.length,pages:pages.length,dialogs:dialogs.length,passed:rows.filter(row=>row.kind==='interactions'&&row.status==='self_check_passed').length},review:'待用户统一验收与独立审查'};
}
export function readTraceCsv(file){
 const [header,...rows]=fs.readFileSync(file,'utf8').trim().split(/\r?\n/),keys=header.replace(/^\uFEFF/,'').split(',');
 return rows.map((line,index)=>{const values=line.split(',');if(values.length!==keys.length)throw Error('trace_csv_column_count:'+index);return Object.fromEntries(values.map((value,column)=>[keys[column],value]));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd(),cloud=process.argv.includes('--cloud');
 const mapFile=cloud?'docs/review/interaction-map-cloud.json':'docs/review/interaction-map.json';
 const defaultResults=cloud?'docs/review/logs/browser-executed-tests-cloud.json':'docs/review/logs/browser-executed-tests.json';
 const outFile=cloud?'docs/review/coverage-report-cloud.json':'docs/review/coverage-report.json';
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),interactions=readTraceCsv('docs/review/interaction-trace.csv'),surfaces=readTraceCsv('docs/review/page-dialog-trace.csv'),pages=surfaces.filter(row=>row.id.startsWith('P')&&!row.id.startsWith('PGD')),dialogs=surfaces.filter(row=>!pages.includes(row));
 let report;
 try{
  const map=read(mapFile),resultFiles=process.argv.filter(arg=>arg.endsWith('.json')&&arg!==mapFile).length?process.argv.filter(arg=>arg.endsWith('.json')):[defaultResults],results=resultFiles.flatMap(file=>read(file).tests??[]);
  const assertionCache=new Map(),hashCache=new Map();
  const currentHash=file=>{if(hashCache.has(file))return hashCache.get(file);let hash='';try{hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');}catch{/* 忽略 */}hashCache.set(file,hash);return hash;};
  report=evaluateTraceability({interactions,pages,dialogs,map,results,verifySourceHash:(proof,result)=>{if(typeof proof.sourceHash!=='string'||!proof.sourceHash)return false;return currentHash(result.file)===proof.sourceHash;},verifyAssertions:(proof,result)=>{if(!result.file?.startsWith('tests/e2e/'))return false;try{if(!assertionCache.has(result.file))assertionCache.set(result.file,new Set(observableAssertionLines(fs.readFileSync(path.join(root,result.file),'utf8'))));return proof.assertionLines.every(line=>assertionCache.get(result.file).has(line));}catch{return false;}},verifySource:entry=>Array.isArray(entry.sources)&&entry.sources.length>0&&entry.sources.every(binding=>{if(!binding.file?.startsWith('src/')||!binding.anchor)return false;try{return fs.readFileSync(path.join(root,binding.file),'utf8').includes(binding.anchor);}catch{return false;}})});
  if(interactions.length!==260||pages.length!==23||dialogs.length!==30)report.errors.push({code:'canonical_count_mismatch'});
  for(const list of [interactions,pages,dialogs])if(new Set(list.map(row=>row.id)).size!==list.length)report.errors.push({code:'canonical_duplicate'});
  report.complete=report.errors.length===0;
 }catch(error){report={complete:false,errors:[{code:'coverage_input_unavailable',detail:error.message}],review:'待审查'};}
 fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({complete:report.complete,summary:report.summary,errorCount:report.errors.length}));process.exitCode=report.complete?0:1;
}
