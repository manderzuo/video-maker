import {test,expect} from '../helpers/network-guard';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const stored=(page:Page)=>page.evaluate(async()=>{const url='/tests/fixtures/asset-library.ts';return (await import(url)).storedAssets();});
test.beforeEach(async({page})=>{await page.goto('/assets');await page.evaluate(async()=>{const url='/tests/fixtures/asset-library.ts';await (await import(url)).seedAssetLibrary();});await page.reload();});

test('T44 M04/M06 actual native decoder failure disables playback and seek without changing original identity or graph',async({page,networkCounter})=>{
 await page.evaluate(async()=>{const url='/src/infrastructure/storage/database.ts';const {openStudioDb,transact,requestResult}=await import(url),db=await openStudioDb();try{await transact(db,['assets','blobs'],'readwrite',async(tx:IDBTransaction)=>{const assets=await requestResult(tx.objectStore('assets').getAll()),asset=assets.find((row:{title:string})=>row.title==='声音220.wav');tx.objectStore('blobs').put({id:asset.blobKey,blob:new Blob([new Uint8Array([0])],{type:'audio/wav'})});});}finally{db.close();}});
 const before=await stored(page);await page.reload();const card=page.getByTestId('asset-card').filter({has:page.getByLabel('选择 声音220.wav',{exact:true})});
 await expect(card.getByRole('alert')).toHaveText('媒体无法解码，请在详情下载原文件。');
 expect(await card.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?element.error?.code:undefined)).toBe(4);
 await card.getByLabel('声音220.wav 播放进度',{exact:true}).focus();
 await expect(card.getByRole('button',{name:'播放 声音220.wav',exact:true})).toBeDisabled();
 await expect(card.getByLabel('声音220.wav 播放进度',{exact:true})).toBeDisabled();
 await page.screenshot({path:'docs/review/screenshots/T44-native-decode-disabled.png',fullPage:true});
 expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);expect(networkCounter.evidence.coreWrites).toBe(0);
});

test('T44 M03 actual image Blob read failure keeps preview dismissible and permits an explicit reopening retry',async({page,networkCounter})=>{
 const before=await stored(page);await expect(page.getByRole('button',{name:'预览 参考.png',exact:true})).toBeVisible();await page.evaluate(()=>{const original=IDBObjectStore.prototype.get;let armed=true;IDBObjectStore.prototype.get=function(...args:Parameters<typeof original>){if(armed&&this.name==='blobs'){armed=false;throw new DOMException('native-image-read-denied','UnknownError');}return original.apply(this,args);};});
 await page.getByRole('button',{name:'预览 参考.png',exact:true}).click();const dialog=page.getByRole('dialog',{name:'素材预览',exact:true});await expect(dialog.getByRole('alert')).toHaveText('本地媒体读取失败，请重试。');await dialog.getByRole('button',{name:'关闭素材预览',exact:true}).click();expect(await stored(page)).toEqual(before);await page.getByRole('button',{name:'预览 参考.png',exact:true}).click();await expect(dialog.getByRole('img',{name:'参考.png',exact:true})).toBeVisible();expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('T44 M11 actual original download read failure reports download error and retries only the same local bytes',async({page,networkCounter})=>{
 const before=await stored(page);await page.getByRole('button',{name:'详情 参考.png',exact:true}).click();await expect(page.getByRole('complementary',{name:'素材详情',exact:true}).getByRole('img',{name:'参考.png',exact:true})).toBeVisible();await page.evaluate(()=>{const original=IDBObjectStore.prototype.get;let armed=true;IDBObjectStore.prototype.get=function(...args:Parameters<typeof original>){if(armed&&this.name==='blobs'){armed=false;throw new DOMException('native-download-read-denied','UnknownError');}return original.apply(this,args);};});
 await page.getByRole('button',{name:'下载原素材',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('原素材下载失败，请重新读取或关联本地文件；素材与任务记录保留。');expect(await stored(page)).toEqual(before);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载原素材',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toBe('参考.png');const bytes=await readFile((await download.path())!),original=before.assets.find((row:{title:string})=>row.title==='参考.png');expect(bytes.length).toBe(original.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(original.sha256);expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('T44 M05 actual native mute and volume survive SPA navigation only and do not enter creative storage',async({page,networkCounter})=>{
 const before=await stored(page),card=page.getByTestId('asset-card').filter({has:page.getByLabel('选择 声音220.wav',{exact:true})});
 await card.getByRole('button',{name:'取消静音 声音220.wav',exact:true}).click();await card.getByLabel('声音220.wav 音量',{exact:true}).fill('0.4');
 await expect.poll(()=>card.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?{muted:element.muted,volume:element.volume}:null)).toEqual({muted:false,volume:0.4});
 await page.getByRole('link',{name:'项目',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);await page.getByRole('link',{name:'素材',exact:true}).click();
 await expect.poll(()=>card.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?{muted:element.muted,volume:element.volume}:null)).toEqual({muted:false,volume:0.4});expect(await stored(page)).toEqual(before);
 await page.reload();await expect.poll(()=>card.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?{muted:element.muted,volume:element.volume}:null)).toEqual({muted:true,volume:1});
 expect(await stored(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);expect(networkCounter.evidence.coreWrites).toBe(0);
});

test('T44 M04/M06/M10 same-hash native file restoration clears the old decoder failure and permits explicit local playback',async({page,networkCounter})=>{
 await page.evaluate(async()=>{const p='/src/infrastructure/storage/database.ts',m=await import(p),db=await m.openStudioDb();try{await m.transact(db,['assets','blobs'],'readwrite',async(tx:IDBTransaction)=>{const assets=await m.requestResult(tx.objectStore('assets').getAll()),asset=assets.find((row:{title:string})=>row.title==='声音220.wav');tx.objectStore('blobs').put({id:asset.blobKey,blob:new Blob([new Uint8Array([0])],{type:'audio/wav'})});});}finally{db.close();}});
 await page.reload();await page.getByRole('button',{name:'详情 声音220.wav',exact:true}).click();const inspector=page.getByRole('complementary',{name:'素材详情',exact:true});await expect(inspector.getByRole('alert')).toHaveText('媒体无法解码，请在详情下载原文件。');await expect(inspector.getByRole('button',{name:'播放 声音220.wav',exact:true})).toBeDisabled();const before=await stored(page),bytes=await page.evaluate(async()=>{const p='/tests/fixtures/asset-library.ts';return Array.from(new Uint8Array(await (await import(p)).wave(220).arrayBuffer()));});
 await inspector.getByLabel('重新关联文件',{exact:true}).setInputFiles({name:'声音220.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});await expect(inspector.getByRole('status').filter({hasText:'相同内容已恢复，原素材身份与来源保留。'})).toBeVisible();await expect.poll(()=>inspector.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?element.readyState:0)).toBeGreaterThanOrEqual(2);await expect(inspector.getByRole('alert')).toHaveCount(0);await expect(inspector.getByRole('button',{name:'播放 声音220.wav',exact:true})).toBeEnabled();await expect(inspector.getByLabel('声音220.wav 播放进度',{exact:true})).toBeEnabled();await inspector.getByRole('button',{name:'播放 声音220.wav',exact:true}).click();await expect.poll(()=>inspector.locator('audio').evaluate(element=>element instanceof HTMLMediaElement?element.paused:true)).toBe(false);
 const after=await stored(page);expect(after.assets).toEqual(before.assets);expect(after.graph).toEqual(before.graph);expect(after.runs).toEqual(before.runs);expect(after.blobs.find((row:{id:string})=>row.id===before.assets.find((a:{title:string})=>a.title==='声音220.wav').blobKey).bytes).toBe(bytes.length);expect(networkCounter.paidRequests).toHaveLength(0);
});
