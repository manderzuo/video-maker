import {defineConfig} from '@playwright/test';
import task3 from './playwright.account-api-ui.config';
export default defineConfig({...task3,testMatch:['account-api-settings.spec.ts','account-welcome-integration.spec.ts'],reporter:[['list'],['./tests/helpers/coverage-reporter.ts',{output:'work/account-api-cloud/account-integration-ui-evidence.json'}]],outputDir:'work/account-api-cloud/account-integration-ui-results'});
