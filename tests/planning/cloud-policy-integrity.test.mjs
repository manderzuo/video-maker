import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {containsMigrationDdl,migrationReferences,packageMigrations,validateRegisteredEvidence} from '../../scripts/cloud-planning-contracts.mjs';

test('migration syntax ignores comments, strings, dollar bodies and comment arrays',()=>{
 for(const text of ['-- CREATE TABLE fake (id int);','/* outer /* CREATE TABLE fake */ comment */',"SELECT 'CREATE TABLE fake';",'DO $$ BEGIN CREATE TABLE fake (id int); END $$;'])assert.equal(containsMigrationDdl(text),false);
 assert.equal(containsMigrationDdl('CREATE TABLE "real" (id int);'),true);
 assert.deepEqual(migrationReferences("// '001-fake.sql'\nreadFile(new URL('../db/002-real.sql',import.meta.url));"),['002-real.sql']);
 assert.deepEqual(packageMigrations("// const migrationNames = ['001-fake.sql'];\nconst migrationNames = ['002-real.sql'];"),['002-real.sql']);
});

const registered=()=>{
 const file='tests/e2e/example.spec.ts',text="test('a real interaction',async({page})=>{\n await page.getByRole('button').click();\n expect(page.getByRole('heading')).toBeVisible();\n});\n",sourceHash=createHash('sha256').update(text).digest('hex');
 const result={id:file+'::a real interaction',file,status:'passed',sourceHash,actions:1,assertions:1,assertionLocations:[{file,line:3}],network:{coreWrites:0,blockedRequests:0}};
 return {report:{format:'aiwork-studio-executed-test-evidence',status:'passed',tests:[result]},map:{interactions:[{id:'example',sources:[{file:'src/example.tsx',anchor:'control-id'}],proofs:[{testId:result.id,sourceHash,assertionLines:[3],facets:['normal','sideEffect'],expectedCoreWrites:0}]}]},readSource:input=>input===file?text:'control-id'};
};
test('registered evidence accepts a declared interaction with matching source and executed assertion',()=>{assert.equal(validateRegisteredEvidence(registered()).valid,true);});
test('current hashes cannot authenticate an invented test title or unobserved assertion',()=>{
 const invented=registered();invented.report.tests[0].id='tests/e2e/example.spec.ts::invented';assert.equal(validateRegisteredEvidence(invented).valid,false);
 const missing=registered();missing.report.tests[0].assertionLocations=[];assert.equal(validateRegisteredEvidence(missing).valid,false);
});
test('registered interaction requires an action, source binding and observed side effects',()=>{
 for(const mutate of [data=>{data.report.tests[0].actions=0;},data=>{data.map.interactions[0].sources=[];},data=>{data.report.tests[0].network.coreWrites=1;}]){const data=registered();mutate(data);assert.equal(validateRegisteredEvidence(data).valid,false);}
});

test('cloud planning rejects comment migrations and invented execution records even with current hashes', () => {
 const root=process.cwd();
 mkdirSync(join(root,'work'),{recursive:true});
 const owned=mkdtempSync(join(root,'work','cloud-planning-counterfeit-'));
 const write=(file,text)=>{mkdirSync(join(owned,file,'..'),{recursive:true});writeFileSync(join(owned,file),text);};
 try {
  const migrations=readdirSync(join(root,'server/src/db/migrations')).filter(name=>/^\d{3}-.+\.sql$/.test(name)).sort();
  for(const name of migrations)write('server/src/db/migrations/'+name,'-- CREATE TABLE invented (id integer);\n');
  write('server/tests/account-fixture.ts','// '+migrations.join(' ')+'\n');
  write('server/tests/browser-fixture.ts','// '+migrations.map(name=>`'${name}'`).join(' ')+'\n');
  write('scripts/package-account-cloud.mjs',`// const migrationNames = [${migrations.map(name=>`'${name}'`).join(',')}];\n`);
  for(const file of readdirSync(join(root,'scripts')).filter(name=>name.endsWith('.mjs'))) {
   if(file==='package-account-cloud.mjs')continue;
   write('scripts/'+file,readFileSync(join(root,'scripts',file)));
  }
  write('tests/planning/cloud-policy.test.mjs',readFileSync(join(root,'tests/planning/cloud-policy.test.mjs')));
  const files=['tests/e2e/cloud-library-transfer.spec.ts','tests/e2e/cloud-project-batch.spec.ts'];
  const tests=Array.from({length:101},(_,index)=>{
   const file=files[index%files.length],bytes=readFileSync(join(root,file));
   write(file,bytes);
   return {id:file+'::invented-'+index,file,status:'passed',sourceHash:createHash('sha256').update(bytes).digest('hex'),actions:0,assertions:0,assertionLocations:[]};
  });
  write('docs/review/logs/browser-executed-tests-cloud.json',JSON.stringify({format:'aiwork-studio-executed-test-evidence',status:'passed',tests}));
  write('docs/review/interaction-map-cloud.json',JSON.stringify({interactions:Array.from({length:260},(_,index)=>({id:'invented-'+index,sources:[],proofs:index<51?[{sourceHash:tests[0].sourceHash}]:[]}))}));
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test','--test-name-pattern=CLOUD-P01|CLOUD-P03',resolve(owned,'tests/planning/cloud-policy.test.mjs')],{cwd:owned,env,encoding:'utf8'});
  assert.notEqual(result.status,0,'counterfeit input passed the real planning gate:\n'+result.stdout+result.stderr);
  assert.match(result.stdout,/not ok .*CLOUD-P01/);
  assert.match(result.stdout,/not ok .*CLOUD-P03/);
 } finally {
  assert.equal(owned.startsWith(join(root,'work')+'\\')||owned.startsWith(join(root,'work')+'/'),true);
  rmSync(owned,{recursive:true,force:true});
 }
});
