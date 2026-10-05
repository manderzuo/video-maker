import {test,expect} from '../helpers/network-guard';
import type {Page} from '@playwright/test';

const stored=(page:Page)=>page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';return(await import(path)).reviewStoredState();});
const openCanvas=(page:Page)=>page.goto('/projects/p1/canvas?node=result-ref');
test.beforeEach(async({page})=>{
 await page.goto('/projects');
 await page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';await(await import(path)).seedResultReview(3000);});
 await openCanvas(page);
});

test('QA51 result node click plays cached video, supports pause and seek, and closes without changing content',async({page,networkCounter})=>{
 const before=await stored(page),opener=page.getByTestId('node-result-ref').getByRole('button',{name:'播放视频',exact:true});
 await opener.click();const dialog=page.getByRole('dialog',{name:'视频播放',exact:true}),video=dialog.locator('video');
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>!v.paused&&v.currentTime>0),{intervals:[50]}).toBe(true);
 await dialog.getByRole('button',{name:'暂停 原创版本1.webm',exact:true}).click();await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 const progress=dialog.getByRole('slider',{name:'原创版本1.webm 播放进度',exact:true});await progress.fill('1');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(1,1);
 await dialog.getByRole('button',{name:'播放 原创版本1.webm',exact:true}).click();await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>!v.paused)).toBe(true);
 await page.screenshot({path:'work/qa-20261005/canvas-video-play/isolated-player.png'});
 await video.evaluate(v=>{Reflect.set(window,'qa51ClosedMedia',v);});await dialog.getByRole('button',{name:'关闭视频播放',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();expect(await page.evaluate(()=>{const v=Reflect.get(window,'qa51ClosedMedia') as HTMLVideoElement;return v.paused&&!v.hasAttribute('src');})).toBe(true);
 const after=await stored(page);expect(after.runs).toEqual(before.runs);expect(after.assets).toEqual(before.assets);expect(after.graph.nodes).toEqual(before.graph.nodes);expect(after.graph.edges).toEqual(before.graph.edges);
 await opener.click();await expect.poll(()=>page.getByRole('dialog',{name:'视频播放',exact:true}).locator('video').evaluate((v:HTMLVideoElement)=>!v.paused),{intervals:[50]}).toBe(true);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA51 locked video asset node still plays when automatic playback preference is off',async({page,networkCounter})=>{
 await page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts',d=await import(path),db=await d.openStudioDb();try{await d.transact(db,['graphs'],'readwrite',async(tx:IDBTransaction)=>{const g=await d.requestResult(tx.objectStore('graphs').get('p1'));g.nodes=[{id:'result-ref',type:'asset',title:'已生成的视频素材',x:20,y:20,locked:true,data:{kind:'asset',assetId:'result-asset-1'}}];g.edges=[];tx.objectStore('graphs').put(g);});}finally{db.close();}});
 await page.reload();await page.getByTestId('node-result-ref').getByRole('button',{name:'播放视频',exact:true}).click();
 await expect.poll(()=>page.getByRole('dialog',{name:'视频播放',exact:true}).locator('video').evaluate((v:HTMLVideoElement)=>!v.paused),{intervals:[50]}).toBe(true);expect(networkCounter.paidRequests).toHaveLength(0);
});

for(const condition of ['missing','corrupt'] as const)test(`QA51 ${condition} cached video gives an honest recovery message without remote calls`,async({page,networkCounter})=>{
 await page.evaluate(async mode=>{const path='/src/infrastructure/storage/database.ts',d=await import(path),db=await d.openStudioDb();try{await d.transact(db,['assets','blobs'],'readwrite',async(tx:IDBTransaction)=>{const a=await d.requestResult(tx.objectStore('assets').get('result-asset-1'));if(mode==='missing')tx.objectStore('blobs').delete(a.blobKey);else tx.objectStore('blobs').put({id:a.blobKey,blob:new Blob(['invalid video'],{type:'video/webm'})});});}finally{db.close();}},condition);
 await page.getByTestId('node-result-ref').getByRole('button',{name:'播放视频',exact:true}).click();const dialog=page.getByRole('dialog',{name:'视频播放',exact:true});
 await expect(dialog).toContainText(condition==='missing'?'本地文件缺失':'媒体无法解码');
 if(condition==='corrupt')await expect(dialog.getByRole('button',{name:'播放 原创版本1.webm',exact:true})).toBeDisabled();
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA51 browser playback policy rejection retains usable manual play without a decode error',async({page})=>{
 await page.evaluate(()=>{const play=HTMLMediaElement.prototype.play;let refused=false;HTMLMediaElement.prototype.play=function(){if(!refused){refused=true;return Promise.reject(new DOMException('policy test','NotAllowedError'));}return play.call(this);};});
 await page.getByTestId('node-result-ref').getByRole('button',{name:'播放视频',exact:true}).click();const dialog=page.getByRole('dialog',{name:'视频播放',exact:true});await expect(dialog.locator('video')).toBeVisible();
 await expect(dialog.getByRole('alert')).toHaveCount(0);await dialog.getByRole('button',{name:'播放 原创版本1.webm',exact:true}).click();
 await expect.poll(()=>dialog.locator('video').evaluate((v:HTMLVideoElement)=>!v.paused),{intervals:[50]}).toBe(true);
});
