import {test,expect} from '../helpers/network-guard';
test('T07 browser: worker hash, decoded metadata, thumbnail and individual corruption reporting without upload',async({page,networkCounter})=>{
 await page.goto('/tests/fixtures/import.html');
 const bytes=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=16;canvas.getContext('2d')!.fillRect(0,0,32,16);return Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));});
 await page.getByLabel('选择素材').setInputFiles([{name:'本地.png',mimeType:'image/png',buffer:Buffer.from(bytes)},{name:'损坏.png',mimeType:'image/png',buffer:Buffer.from([1,2,3])}]);
 await expect(page.getByRole('status')).toHaveText('成功 1，失败 1');
 const report=JSON.parse(await page.locator('#result').innerText());
 expect(report.successes[0].asset.width).toBe(32);expect(report.successes[0].asset.height).toBe(16);
 expect(report.successes[0].asset.sha256).toMatch(/^[a-f0-9]{64}$/);expect(report.failures[0].errorCode).toBe('media_invalid_signature');
 const storage=await page.evaluate(async()=>{
  const moduleUrl='/src/infrastructure/storage/database.ts';
  const {openStudioDb,transact,requestResult}=await import(moduleUrl) as typeof import('../../src/infrastructure/storage/database');
  const db=await openStudioDb();
  try{return await transact(db,['assets','blobs'],'readonly',async tx=>{const assets=await requestResult(tx.objectStore('assets').getAll());const blob=await requestResult(tx.objectStore('blobs').get('thumbnail:'+assets[0].sha256));return {assetCount:assets.length,thumbnailBytes:blob?.blob.size};});}finally{db.close();}
 });
 expect(storage.assetCount).toBe(1);expect(storage.thumbnailBytes).toBeGreaterThan(0);
 expect(networkCounter.requests.filter(r=>r.method==='POST')).toHaveLength(0);
 await page.screenshot({path:'docs/review/screenshots/T07-local-import.png'});
});
