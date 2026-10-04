import {it,expect} from 'vitest';
import config from '../../playwright.distribution.config';
it('QA50 distribution evidence cannot overwrite the full interaction execution record',()=>{
 const reporter=Array.isArray(config.reporter)?config.reporter.find(row=>Array.isArray(row)&&row[0]==='./tests/helpers/coverage-reporter.ts'):undefined;
 expect(reporter).toEqual(['./tests/helpers/coverage-reporter.ts',{output:'docs/review/logs/distribution-executed-tests.json'}]);
});
