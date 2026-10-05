import {test,expect} from '../helpers/network-guard';
import {seedStudio} from '../helpers/seed-studio';
import type {Page} from '@playwright/test';

async function view(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('aiwork-studio:viewport:p1')!).view as {x:number;y:number;scale:number});}
async function graph(page:Page){return page.evaluate(async()=>{const path='/src/infrastructure/storage/database.ts',d=await import(path);return d.withDatabase(undefined,(db:import('../../src/infrastructure/storage/database').StudioDb)=>d.transact(db,['graphs'],'readonly',(tx:IDBTransaction)=>d.requestResult(tx.objectStore('graphs').get('p1'))));});}
test.beforeEach(async({page})=>{await seedStudio(page,'canvas-project');await page.goto('/projects/p1/canvas');await expect(page.getByLabel('缩放百分比')).toHaveValue('100');});

test('QA54 Alt wheel zooms at the pointer in both directions and persists without creative edits',async({page,networkCounter})=>{
 const before=await graph(page),box=await page.getByTestId('canvas-stage').boundingBox();if(!box)throw Error('canvas_missing');
 const anchor={x:box.width*.8,y:box.height*.8};await page.mouse.move(box.x+anchor.x,box.y+anchor.y);
 await page.keyboard.down('Alt');try{await page.mouse.wheel(0,-120);await expect.poll(async()=>(await view(page)).scale).toBeCloseTo(1.1,5);
  const zoomed=await view(page);expect((anchor.x-zoomed.x)/zoomed.scale).toBeCloseTo(anchor.x,0);expect((anchor.y-zoomed.y)/zoomed.scale).toBeCloseTo(anchor.y,0);
  await page.mouse.wheel(0,120);await expect.poll(async()=>(await view(page)).scale).toBeCloseTo(1,5);
 }finally{await page.keyboard.up('Alt');}
 const saved=await view(page);await page.reload();await expect.poll(()=>view(page)).toEqual(saved);expect(await graph(page)).toEqual(before);expect(networkCounter.paidRequests).toHaveLength(0);
});

test('QA54 Alt wheel respects both limits and Ctrl wheel remains usable',async({page})=>{
 const stage=await page.getByTestId('canvas-stage').boundingBox();if(!stage)throw Error('canvas_missing');const zoom=page.getByLabel('缩放百分比');
 for(const limit of [25,200]){await zoom.fill(String(limit));await zoom.press('Enter');await page.mouse.move(stage.x+stage.width*.8,stage.y+stage.height*.8);await page.keyboard.down('Alt');try{await page.mouse.wheel(0,limit===25?120:-120);}finally{await page.keyboard.up('Alt');}await expect(zoom).toHaveValue(String(limit));expect((await view(page)).scale).toBe(limit/100);}
 await page.keyboard.down('Control');try{await page.mouse.wheel(0,120);await expect.poll(async()=>(await view(page)).scale).toBeLessThan(2);}finally{await page.keyboard.up('Control');}
});

test('QA54 ordinary wheel inside a text node scrolls its content without moving or zooming the canvas',async({page})=>{
 await page.getByTestId('node-text-1').getByLabel('节点文本').fill(('原创滚动内容\n').repeat(80));await page.getByRole('button',{name:'立即保存',exact:true}).click();
 const text=page.getByTestId('node-text-1').getByLabel('节点文本'),box=await text.boundingBox();if(!box)throw Error('text_missing');const before=await view(page);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,120);await expect.poll(()=>text.evaluate((el:HTMLTextAreaElement)=>el.scrollTop)).toBeGreaterThan(0);expect(await view(page)).toEqual(before);
});
