import {test,expect} from '../helpers/network-guard';
import {seedVisualRuntime,visualViews,openVisualView,viewportEvidence} from '../helpers/visual-runtime';
import {writeFileSync} from 'node:fs';
test.setTimeout(180000);
for(const theme of ['dark','light'] as const)for(const width of [1440,1280,1024,720])test(`T46 visual runtime ${theme} ${width}: all 23 page and panel identities retain readable type, bounded dialogs and zero fee`,async({page,networkCounter})=>{
 await page.setViewportSize({width,height:1000});await seedVisualRuntime(page);await page.evaluate(async theme=>{const p='/src/features/settings/preferences-store.ts';(await import(p)).savePreferences({theme});},theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);const records=[];
 for(const view of visualViews){await openVisualView(page,view);const evidence=await viewportEvidence(page);expect(evidence.bodyFont,view.id+' typography').toBe('16px');expect(evidence.documentWidth,view.id+' document overflow').toBeLessThanOrEqual(evidence.innerWidth);expect(evidence.theme).toBe(theme);expect(evidence.dialogBounds.filter(r=>r.left<0||r.right>evidence.innerWidth||r.top<0||r.bottom>evidence.innerHeight),view.id+' dialog bounds').toEqual([]);const screenshot='docs/review/screenshots/T46-'+view.id+'-'+theme+'-'+width+'.png';await page.screenshot({path:screenshot,fullPage:true});records.push({id:view.id,path:view.path,screenshot,evidence,actualRenderedPage:true,userApproved:false});}
 expect(new Set(records.map(r=>r.id)).size).toBe(23);expect(networkCounter.paidRequests).toHaveLength(0);writeFileSync('docs/review/logs/T46-visual-'+theme+'-'+width+'.json',JSON.stringify({records,network:networkCounter.evidence,userAcceptance:'pending',independentReview:'pending'},null,2)+'\n');
});
