import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import type {TestCase,TestResult,FullResult} from '@playwright/test/reporter';
import CoverageReporter from '../helpers/coverage-reporter';
const dirs:string[]=[],original=process.env.STUDIO_COVERAGE_REPORT;
afterEach(()=>{if(original===undefined)delete process.env.STUDIO_COVERAGE_REPORT;else process.env.STUDIO_COVERAGE_REPORT=original;for(const dir of dirs.splice(0)){const relative=path.relative(path.resolve(tmpdir()),path.resolve(dir));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('test_cleanup_outside_temp');fs.rmSync(dir,{recursive:true,force:true});}});
function fixture(){const dir=fs.mkdtempSync(path.join(tmpdir(),'studio-reporter-test-'));dirs.push(dir);const target=path.join(dir,'evidence.json');process.env.STUDIO_COVERAGE_REPORT=target;return {target,reporter:new CoverageReporter(),test:{location:{file:path.join(process.cwd(),'tests/e2e/fixture.spec.ts'),line:1,column:1},title:'Durable completed result',annotations:[{type:'studio:network-evidence',description:JSON.stringify({coreWrites:0,paidRequests:0,blockedRequests:0})}]} as unknown as TestCase};}
it('completed test evidence survives before runner teardown reaches onEnd',()=>{
 const {target,reporter,test}=fixture();reporter.onTestBegin(test);reporter.onTestEnd(test,{status:'passed'} as TestResult);
 expect(fs.existsSync(target)).toBe(true);const saved=JSON.parse(fs.readFileSync(target,'utf8'));expect(saved.status).toBe('running');expect(saved.tests).toHaveLength(1);expect(saved.tests[0]).toMatchObject({status:'passed',network:{coreWrites:0,paidRequests:0,blockedRequests:0}});
});
it('final runner status replaces partial status without losing completed failures',()=>{
 const {target,reporter,test}=fixture();reporter.onTestBegin(test);reporter.onTestEnd(test,{status:'failed'} as TestResult);expect(fs.existsSync(target)).toBe(true);
 reporter.onEnd({status:'failed'} as FullResult);const saved=JSON.parse(fs.readFileSync(target,'utf8'));expect(saved.status).toBe('failed');expect(saved.tests[0].status).toBe('failed');
});
it('an explicitly configured report path isolates a secondary test runner from the main coverage report',()=>{
 const {target:fallback,test}=fixture();const configured=path.join(path.dirname(fallback),'performance.json');
 const reporter=new CoverageReporter({output:configured});reporter.onTestBegin(test);reporter.onTestEnd(test,{status:'passed'} as TestResult);
 expect(fs.existsSync(configured)).toBe(true);
 expect(fs.existsSync(fallback)).toBe(false);
});
