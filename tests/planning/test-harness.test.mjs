import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {isAllowedTestUrl} from '../../tests/helpers/network-policy.mjs';
const p=JSON.parse(readFileSync('package.json','utf8'));
test('T03-C01: public and foreign-loopback requests fail closed',()=>{
 assert.equal(isAllowedTestUrl('https://business.invalid/v1/videos','http://127.0.0.1:4179'),false);
 assert.equal(isAllowedTestUrl('http://127.0.0.1:4180/v1/videos','http://127.0.0.1:4179'),false);
 assert.equal(isAllowedTestUrl('http://127.0.0.1:4179/tests/mock/video','http://127.0.0.1:4179'),true);
});
test('T03-C02: server reuse is disabled',()=>assert.match(readFileSync('playwright.config.ts','utf8'),/reuseExistingServer:\s*false/));
test('T03-C03: isolated mock tooling exposes all commands without credentials',()=>{
 for(const s of ['dev','build','typecheck','lint','test:unit','test:e2e','test:security','test:trace','test:live','verify'])assert.equal(typeof p.scripts[s],'string',s);
 assert.match(p.scripts['test:unit'],/vitest run/);
});
test('T03-C04: empty suites and missing dependencies cannot pass',()=>{
 assert.doesNotMatch(JSON.stringify(p.scripts),/passWithNoTests|\|\| true/);
 assert.equal(Object.values(p.dependencies).every(v=>/^\d+\.\d+\.\d+$/.test(v)),true);
});
test('T03-C05: one npm lock contains exact declared dependencies',()=>{
 assert.ok(existsSync('package-lock.json'));
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 assert.deepEqual(lock.packages[''].dependencies,p.dependencies);
});
