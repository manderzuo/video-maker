import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire('E:/trae-studio/tools/visual-review/package.json');
const { chromium }=require('playwright');
const manifest=JSON.parse(readFileSync('docs/design/visual-manifest.json','utf8'));
mkdirSync('docs/design/captures',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const report={tool:'playwright 1.58.2 / existing Edge / isolated temporary context',artifactType:'static-document-review-only',businessRequests:[],blockedRequests:[],pageErrors:[],consoleErrors:[],storageWrites:[],captureCount:0,allBusinessButtonsDisabled:true,layoutFailures:[],reviewControlChecks:[],zoomVerification:'not performed; no device scaling substituted for browser zoom',screenshots:[]};
report.typographyChecks=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.origin==='http://127.0.0.1:4178' && url.pathname.startsWith('/docs/design/') && route.request().method()==='GET'){await route.continue();}
 else{report.blockedRequests.push({url:url.origin+url.pathname,method:route.request().method()});await route.abort();}
});
const page=await context.newPage();
page.on('pageerror',error=>report.pageErrors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
page.on('request',request=>{if(/\/core-api\/|\/v1\/|\/healthz/.test(request.url()))report.businessRequests.push({url:request.url(),method:request.method()});});
await context.addInitScript(()=>{
 window.__reviewStorageWrites=[];
 const mark=(kind)=>window.__reviewStorageWrites.push(kind);
 const original=Storage.prototype.setItem;
 Storage.prototype.setItem=function(...args){mark('WebStorage.setItem');return original.apply(this,args);};
 const open=indexedDB.open.bind(indexedDB);
 indexedDB.open=(...args)=>{mark('IndexedDB.open');return open(...args);};
});
async function capture(entry){
 await page.setViewportSize(entry.viewport);
 const query=new URLSearchParams({page:entry.pageId,state:entry.state,theme:entry.theme,capture:'1'});
 if(entry.dialogId)query.set('dialog',entry.dialogId);
 await page.goto('http://127.0.0.1:4178/docs/design/visual-review.html?'+query,{waitUntil:'load'});
 await page.locator('body[data-page]').waitFor();
 await checkTypography(entry.capturePath);
 const checks=await page.evaluate(()=>({allDisabled:[...document.querySelectorAll('[data-business]')].every(button=>button.disabled),writes:window.__reviewStorageWrites,overflow:document.documentElement.scrollWidth>innerWidth,dialogFooter:(()=>{const footer=document.querySelector('.dialog-footer');if(!footer)return true;const rect=footer.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;})()}));
 report.allBusinessButtonsDisabled&&=checks.allDisabled;
 report.storageWrites.push(...checks.writes);
 if(checks.overflow||!checks.dialogFooter)report.layoutFailures.push({path:entry.capturePath,...checks});
 await page.screenshot({path:entry.capturePath,fullPage:false});
 report.captureCount++;report.screenshots.push(entry.capturePath);
 if(report.captureCount%25===0)console.log(`Captured ${report.captureCount} static review states`);
}
async function checkTypography(path){
 const sizes=await page.evaluate(()=>{
  const size=element=>parseFloat(getComputedStyle(element).fontSize);
  const visible=selector=>[...document.querySelectorAll(selector)].filter(element=>element.getClientRects().length);
  return {body:size(document.body),secondary:visible('small,.muted').map(size),controls:visible('button,input,select,textarea').map(size)};
 });
 assert.ok(sizes.body>=16,`Reading text must be at least 16px; got ${sizes.body}px (${path})`);
 assert.ok(sizes.secondary.every(size=>size>=14),`Secondary text must be at least 14px (${path})`);
 assert.ok(sizes.controls.every(size=>size>=16),`Form controls must be at least 16px (${path})`);
 report.typographyChecks.push({path,...sizes});
}
try{
 // Controls are review navigation only; business operations remain disabled.
 await page.goto('http://127.0.0.1:4178/docs/design/visual-review.html');
 await checkTypography('review-navigation');
 await page.getByLabel('页面',{exact:true}).selectOption('P21');
 assert.equal(await page.locator('body').getAttribute('data-page'),'P21');
 await page.getByLabel('主题',{exact:true}).selectOption('light');
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.getByLabel('弹窗',{exact:true}).selectOption('PGD03');
 assert.equal(await page.getByRole('dialog').count(),1);
 await page.locator('#review-close-dialog').click();
 assert.equal(await page.getByRole('dialog').count(),0);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'review-open-dialog');
 await page.locator('#review-open-dialog').click();
 assert.equal(await page.getByRole('dialog').count(),1);
 await page.locator('#review-open-dialog').press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 report.reviewControlChecks=['page selection','theme selection','dialog open','dialog close','focus return','Escape close'];
 for(const p of manifest.pages)for(const s of p.states)await capture({...s,pageId:p.id});
 for(const d of manifest.dialogs)await capture({pageId:d.id.startsWith('PG')?'P21':'P03',state:'normal',theme:'dark',viewport:{width:1440,height:900},dialogId:d.id,capturePath:d.capturePath});
 for(const state of manifest.criticalStates)await capture(state);
 for(const state of manifest.supplementalStates.filter(s=>!s.browserZoom))await capture(state);
 assert.equal(report.businessRequests.length,0);
 assert.equal(report.blockedRequests.length,0);
 assert.equal(report.pageErrors.length,0);
 assert.equal(report.consoleErrors.length,0);
 assert.equal(report.storageWrites.length,0);
 assert.equal(report.layoutFailures.length,0);
 assert.equal(report.allBusinessButtonsDisabled,true);
 console.log(`Browser checks passed; ${report.captureCount} document screenshots; zero business requests/storage writes.`);
}catch(error){report.failure=error.message;throw error;}
finally{writeFileSync('docs/review/logs/T02-browser-check.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
