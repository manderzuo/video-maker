import base from '../../playwright.config';
export default {...base,testDir:'.',testMatch:'canvas-profile.spec.ts',reporter:[['list'],['../helpers/coverage-reporter.ts']],outputDir:'../../test-results-performance'};
