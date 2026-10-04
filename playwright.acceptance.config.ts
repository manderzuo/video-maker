import base from './playwright.config';
export default {...base,testMatch:['acceptance-online.spec.ts','acceptance-deepseek.spec.ts'],testIgnore:[],webServer:process.env.STUDIO_MANAGED_TEST_SERVER==='1'?undefined:{command:'node scripts/serve-local.mjs --port 4179',url:'http://127.0.0.1:4179',reuseExistingServer:false,timeout:30000}};
