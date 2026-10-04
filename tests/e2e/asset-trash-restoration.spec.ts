import {test,expect} from '../helpers/network-guard';
import type {Page} from '@playwright/test';

const stored=(page:Page)=>page.evaluate(async()=>{
 const path='/tests/fixtures/asset-library.ts';
 return (await import(path)).storedAssets();
});

test('QA32 a soft-deleted referenced asset can be restored through Trash without changing media or task history',async({page,networkCounter})=>{
 await page.goto('/assets');
 await page.evaluate(async()=>{const path='/tests/fixtures/asset-library.ts';await (await import(path)).seedAssetLibrary();});
 await page.reload();
 const before=await stored(page);
 const original=before.assets.find((asset:{title:string})=>asset.title==='参考.png');
 await page.getByRole('button',{name:'详情 参考.png',exact:true}).click();
 await page.getByRole('button',{name:'移到回收站',exact:true}).click();
 await page.getByRole('button',{name:'确认移入素材回收站',exact:true}).click();
 await expect(page.getByRole('button',{name:'详情 参考.png',exact:true})).toHaveCount(0);
 await page.goto('/trash');
 const card=page.getByTestId('trash-asset-'+original.id);
 await expect(card).toContainText('参考.png');
 await card.getByRole('button',{name:'恢复素材',exact:true}).click();
 await expect(card).toHaveCount(0);
 const after=await stored(page);
 expect(after.assets.find((asset:{id:string})=>asset.id===original.id)).toEqual({...original,trashedAt:null});
 expect(after.graph).toEqual(before.graph);
 expect(after.runs).toEqual(before.runs);
 expect(after.blobs).toEqual(before.blobs);
 await page.goto('/assets');
 await expect(page.getByRole('button',{name:'详情 参考.png',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});
