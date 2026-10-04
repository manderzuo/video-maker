import base from '../../playwright.config';
export default {...base,testDir:'.',testMatch:'canvas-profile.spec.ts',reporter:[['list'],['../helpers/coverage-reporter.ts',{output:'docs/review/logs/performance-executed-tests.json'}]],outputDir:'../../test-results-performance'};
