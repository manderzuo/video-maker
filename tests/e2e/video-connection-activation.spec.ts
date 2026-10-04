import {test,expect} from '../helpers/network-guard';
import {f} from '../helpers/fixtures';

test('read-only Seedance catalog proposes the default while paid video remains gated',async({page,networkCounter},testInfo)=>{
 const profile=f.connection({id:'gemstory-qa',name:'Gemstory QA',originSnapshot:'https://api.gemstory.cn',proxyBase:'/core-api/registered/gemstory-qa',contractVersion:'unverified'});
 const contract={version:'unverified',verification:'unknown',evidence:[],routes:{models:true,videoSubmit:false,videoQuery:false,videoContent:false,chat:false,assets:false,workContext:false,continuation:false,backup:false},textModels:[],videoModels:[],videoAliases:[],videoSpecs:[],limits:{}};
 await page.route('**/studio-deployment.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({schemaVersion:1,connections:[{profile,contract}]})}));
 await page.route('**/core-api/registered/gemstory-qa/healthz',route=>route.fulfill({contentType:'application/json',body:'{"status":"ok"}'}));
 await page.route('**/core-api/registered/gemstory-qa/v1/models',route=>route.fulfill({contentType:'application/json',body:'{"data":[{"id":"seedance"}]}'}));
 await page.goto('/settings/connections');
 await page.getByLabel('连接名称',{exact:true}).fill('Gemstory QA');
 await page.getByLabel('Core 服务地址',{exact:true}).fill(profile.originSnapshot);
 await page.getByRole('button',{name:'保存连接地址',exact:true}).click();
 await page.getByLabel('普通用户 Key',{exact:true}).fill('fake-gemstory-readonly-key');
 await page.getByRole('button',{name:'测试连接',exact:true}).click();
 await expect(page.getByLabel('视频 API 状态',{exact:true})).toContainText('视频能力待核验');
 await expect(page.getByLabel('视频 API 状态',{exact:true})).toContainText('模型 seedance');
 await page.getByRole('link',{name:'模型与能力',exact:true}).click();
 await expect(page.getByLabel('默认视频模型',{exact:true})).toHaveValue('seedance');
 await expect(page.getByLabel('默认视频规格',{exact:true})).toBeDisabled();
 await page.screenshot({path:testInfo.outputPath('seedance-default-gated.png'),fullPage:true});
 await page.getByRole('link',{name:'连接与授权',exact:true}).click();
 await page.getByRole('link',{name:'前往项目验证视频生成（需预览确认）',exact:true}).click();
 await expect(page.getByRole('heading',{name:'项目',exact:true})).toBeVisible();
 expect(networkCounter.paidRequests).toHaveLength(0);
});
