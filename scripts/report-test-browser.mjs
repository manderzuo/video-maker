import {chromium} from 'playwright';
import {createRequire} from 'node:module';
const channel=process.env.STUDIO_TEST_BROWSER??'msedge',browser=await chromium.launch({channel,headless:true});
try{console.log(JSON.stringify({node:process.version,playwright:createRequire(import.meta.url)('playwright/package.json').version,channel,browserVersion:browser.version()},null,2));}finally{await browser.close();}
