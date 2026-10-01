import base from './playwright.config';
export default {...base,testMatch:'distribution.spec.ts',testIgnore:[],webServer:{command:'node scripts/serve-local.mjs --port 4179',url:'http://127.0.0.1:4179',reuseExistingServer:false,timeout:30000}};
