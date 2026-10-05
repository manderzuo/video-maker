import {test,expect} from '../helpers/network-guard';

test.beforeEach(async({page})=>{await page.goto('/projects');await page.evaluate(async()=>{const path='/tests/fixtures/result-review.ts';await(await import(path)).seedResultReview();});await page.goto('/projects/p1/results?runId=r1');});

test('QA52 fractional clip ends with the progress slider at its exact maximum',async({page,networkCounter})=>{
 const video=page.locator('video'),progress=page.getByRole('slider',{name:'原创版本1.webm 播放进度',exact:true});
 await page.getByRole('button',{name:'播放 原创版本1.webm',exact:true}).click();
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.ended)).toBe(true);
 const actualDuration=await video.evaluate((v:HTMLVideoElement)=>v.duration);
 await expect.poll(()=>progress.evaluate((s:HTMLInputElement)=>Number(s.max))).toBeCloseTo(actualDuration,3);
 await expect.poll(()=>progress.evaluate((s:HTMLInputElement)=>Math.abs(Number(s.value)-Number(s.max)))).toBeLessThan(.001);
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA52 progress seeks within a second and its End key reaches the final fraction',async({page,networkCounter})=>{
 const video=page.locator('video'),progress=page.getByRole('slider',{name:'原创版本1.webm 播放进度',exact:true});
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
 await progress.fill('0.35');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(.35,2);
 await progress.press('End');await expect.poll(()=>progress.evaluate((s:HTMLInputElement)=>Number(s.value)-Number(s.max))).toBeCloseTo(0,3);
 expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA52 volume and progress tracks have no text-field inset and volume reaches both ends',async({page})=>{
 const sliders=page.locator('.asset-player input[type=range]');await expect(sliders).toHaveCount(2);
 for(const slider of await sliders.all())expect(await slider.evaluate(s=>({padding:getComputedStyle(s).padding,border:getComputedStyle(s).borderWidth,margin:getComputedStyle(s).margin}))).toEqual({padding:'0px',border:'0px',margin:'0px'});
 const volume=page.getByRole('slider',{name:'原创版本1.webm 音量',exact:true}),video=page.locator('video');await volume.press('Home');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.volume)).toBe(0);
 await volume.press('End');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.volume)).toBe(1);
});
