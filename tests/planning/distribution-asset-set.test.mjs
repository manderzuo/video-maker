import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {packageRelease} from '../../scripts/package-release.mjs';

test('QA-005 offline review package excludes a retired chunk retained for existing local tabs',()=>{
 const built=spawnSync(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'build'],{cwd:process.cwd(),encoding:'utf8',timeout:60000});
 assert.equal(built.status,0,(built.stderr||built.stdout).slice(-2000));
 const oldChunk=resolve('dist/assets/previous-client-hash.js');
 writeFileSync(oldChunk,'export const previousClient=true;\n');
 try{
  const result=packageRelease({outputDir:resolve('work/qa-20261003/distribution-asset-set'),offlineReview:true});
  const entries=unzipSync(new Uint8Array(readFileSync(result.output)));
  assert.equal(Object.hasOwn(entries,'dist/assets/previous-client-hash.js'),false,'review package must contain only the current build');
 }finally{unlinkSync(oldChunk);}
});
