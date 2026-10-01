import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/e2e', fullyParallel:false, workers:1, retries:0, reporter:[['list'],['./tests/helpers/coverage-reporter.ts']], outputDir:'test-results',
 use:{baseURL:'http://127.0.0.1:4179',channel:process.env.STUDIO_TEST_BROWSER??(process.env.CI?'chromium':'msedge'),trace:'retain-on-failure',viewport:{width:1280,height:900}},
 webServer:{command:'npm run dev -- --port 4179',url:'http://127.0.0.1:4179',reuseExistingServer:false,timeout:30000},
});
