import fs from 'node:fs';import {createHash} from 'node:crypto';
const browserPath=process.argv[2]??'docs/review/logs/T45-native-final-results.json',unitPath=process.argv[3]??'docs/review/logs/T45-unit-results.json';
const digest=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const browser=JSON.parse(fs.readFileSync(browserPath,'utf8'));
if(browser.status!=='passed'||browser.tests.some(t=>t.status!=='passed'))throw Error('security_native_chain_not_passed');
const rows=browser.tests.filter(t=>t.file==='tests/e2e/recovery-races.spec.ts'),cases=[];
for(let n=1;n<=8;n++){
 const caseId='T45-C'+String(n).padStart(2,'0'),matches=rows.filter(t=>t.title.startsWith(caseId+' '));
 if(matches.length!==1)throw Error('security_case_missing_or_duplicate:'+caseId);
 const t=matches[0],expected=[2,4].includes(n)?1:0;
 if(t.assertions<3||!t.assertionLocations.length||!t.network||t.network.blockedRequests!==0||t.network.paidRequests!==expected||t.network.coreWrites!==expected)throw Error('security_observation_missing_or_unexpected:'+caseId);
 cases.push({caseId,testId:t.id,status:t.status,assertions:t.assertions,assertionLocations:t.assertionLocations,observedNetwork:t.network,expectedOriginalPaidRequests:expected,nativeBrowserStorage:true});
}
if(rows.length!==8)throw Error('security_unmapped_browser_case');
const units=JSON.parse(fs.readFileSync(unitPath,'utf8'));
if(units.numFailedTests!==0||units.numPendingTests!==0||units.numTodoTests!==0||units.numPassedTests!==units.numTotalTests||!units.success)throw Error('security_unit_suite_not_passed');
for(const suffix of ['failure-injection.test.ts','import-attacks.test.ts','credential-leaks.test.ts']){
 const matches=units.testResults.filter(t=>t.name.replaceAll('\\','/').endsWith('/'+suffix));
 if(matches.length!==1||!matches[0].assertionResults.length||matches[0].assertionResults.some(a=>a.status!=='passed'))throw Error('security_required_unit_evidence_missing:'+suffix);
}
const report={taskId:'T45',implementationSelfCheck:'passed',userAcceptance:'pending',independentReview:'pending',network:'local Mock and fake Key only',browser:{path:browserPath,sha256:digest(browserPath),passed:8,failed:0,skipped:0},unit:{path:unitPath,sha256:digest(unitPath),passed:units.numPassedTests,failed:0,skipped:0},sourceSha256:{'tests/e2e/recovery-races.spec.ts':digest('tests/e2e/recovery-races.spec.ts')},cases,limitations:['Unit crash helper uses fake-indexeddb and is supplemental; all eight chain cases separately exercise actual Chromium/native IndexedDB.','Tab closure and injected socket/transaction failure are tested; physical power loss is not performed.','No live Core, actual paid request or production data used.']};
fs.writeFileSync('docs/review/security-evidence.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:8,unit:units.numPassedTests,failed:0,skipped:0,review:'pending'}));
