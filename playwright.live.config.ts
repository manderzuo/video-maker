import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/live',testMatch:'authorized-live.spec.ts',workers:1,retries:0,timeout:10000,reporter:[['list'],['./tests/helpers/coverage-reporter.ts']],outputDir:'test-results-live'});
