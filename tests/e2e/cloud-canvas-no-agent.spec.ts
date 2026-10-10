import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('canvas removes Agent controls and redirects old Agent addresses without invoking Agent APIs',async({page,workspace})=>{
 const project=(await workspace.call('POST','/studio-api/projects',{...workspace.headers(workspace.account),payload:{title:'移除画布 Agent'}})).json();const requests:string[]=[];
 page.on('request',request=>{if(/\/agent(?:[-/]|$)/.test(request.url())&&request.url().includes('/studio-api/'))requests.push(request.url());});
 for(const address of ['canvas','agent']){await page.goto('/projects/'+project.id+'/'+address);await expect(page).toHaveURL(new RegExp('/projects/'+project.id+'/canvas$'));await expect(page.locator('.canvas-stage')).toBeVisible();await expect(page.getByRole('button',{name:/Agent 协作|Agent 提案|新建 Agent 会话/})).toHaveCount(0);}
 expect(requests).toEqual([]);expect(workspace.providerCalls).toHaveLength(0);
});
