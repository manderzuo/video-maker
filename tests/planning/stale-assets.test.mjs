import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('QA-005 keeps a previously served hashed chunk available while publishing a new local build',()=>{
 const outDir=resolve('work/qa-20261003/stale-assets-build');
 const oldChunk=join(outDir,'assets','previous-client-hash.js');
 mkdirSync(join(outDir,'assets'),{recursive:true});
 writeFileSync(oldChunk,'export const previousClient=true;\n');
 const result=spawnSync(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'build','--outDir',outDir],{cwd:process.cwd(),encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,(result.stderr||result.stdout).slice(-2000));
 assert.equal(existsSync(oldChunk),true,'an existing tab may still request this old immutable chunk');
});
