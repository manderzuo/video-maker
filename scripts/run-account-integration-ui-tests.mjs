process.argv.splice(2,0,'--config','playwright.account-integration-ui.config.ts');
await import('./run-account-api-ui-tests.mjs');
