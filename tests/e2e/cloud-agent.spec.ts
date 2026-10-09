import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('stores an agent description, explicitly grants scope and fees, and applies only a reviewed proposal with persisted history',async({page,workspace})=>{
 const h=workspace.headers(workspace.account);await workspace.call('PATCH','/studio-api/me/model-configs/text',{...h,payload:{apiBase:'https://agent.example.test',model:'Vendor/Custom-Agent',apiKey:'FAKE_AGENT_UI_KEY',expectedRevision:null}});const project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'Agent 联合流程'}})).json(),nodeId=randomUUID();await workspace.call('POST','/studio-api/projects/'+project.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:[{id:randomUUID(),type:'add_node',payload:{node:{id:nodeId,type:'text',title:'创意',x:20,y:20,locked:false,data:{kind:'text',text:'原始正文',referenceTokens:[]}}}}]}}});await page.goto('/projects/'+project.id+'/canvas');await page.getByRole('button',{name:'新建 Agent 会话',exact:true}).click();await page.getByLabel('Agent 任务描述',{exact:true}).fill('请整理已选择的文字');await page.getByRole('button',{name:'保存 Agent 描述',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'描述已保存'})).toContainText('描述已保存');await page.getByRole('button',{name:'授权所选范围提出建议',exact:true}).click();await page.getByRole('dialog',{name:'确认 Agent 范围授权',exact:true}).getByRole('button',{name:'确认范围授权',exact:true}).click();await page.getByRole('button',{name:'预览 Agent 建议请求',exact:true}).click();const preview=page.getByRole('dialog',{name:'确认 Agent 文字调用',exact:true});await expect(preview).toContainText('请整理已选择的文字');expect(workspace.providerCalls).toHaveLength(0);await page.getByLabel('我确认本次 Agent 文字调用可能收费',{exact:true}).check();await page.getByRole('button',{name:'确认调用并保存建议',exact:true}).click();await expect(page.getByRole('button',{name:'审阅 Agent 提案',exact:true})).toBeVisible();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('原始正文');await page.getByRole('button',{name:'审阅 Agent 提案',exact:true}).click();const review=page.getByRole('dialog',{name:'云端 Agent 提案审阅',exact:true});await expect(review).toContainText('由用户审阅后保存的 Agent 正文');await page.getByLabel('选择 Agent 操作 edit-1',{exact:true}).check();await page.getByRole('button',{name:'应用选中的 Agent 修改',exact:true}).click();await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('由用户审阅后保存的 Agent 正文');await page.reload();await expect(page.getByLabel('Agent 会话',{exact:true})).toContainText('创作会话');await expect(page.getByLabel('节点文本',{exact:true})).toHaveValue('由用户审阅后保存的 Agent 正文');expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(1);expect(workspace.providerCalls[0].apiKey).toBe('FAKE_AGENT_UI_KEY');await page.screenshot({path:'work/account-api-cloud/cloud-agent-history.png',fullPage:true});
});

test('retries an uncertain conversation creation with the original name and preserves descriptions across a rejected save',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),project=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'Agent 保存重试'}})).json();
 const attempts:Record<string,unknown>[]=[];
 await page.route('**/studio-api/projects/'+project.id+'/agent-conversations',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  attempts.push(route.request().postDataJSON());
  if(attempts.length===1){await workspace.call('POST','/studio-api/projects/'+project.id+'/agent-conversations',{...h,payload:attempts[0]});return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({code:'UNAVAILABLE'})});}
  return route.fallback();
 });
 await page.goto('/projects/'+project.id+'/canvas');
 await page.locator('[data-interaction-id="cloud:agent:title"]').fill('原会话名称');await page.getByRole('button',{name:'新建 Agent 会话',exact:true}).click();
 await expect(page.getByRole('alert').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'新建 Agent 会话',exact:true})).toBeEnabled();
 await expect(page.locator('[data-interaction-id="cloud:agent:title"]')).toBeDisabled();
 await page.getByRole('button',{name:'新建 Agent 会话',exact:true}).click();
 await expect(page.getByLabel('Agent 会话',{exact:true})).toContainText('原会话名称');expect(attempts[1]).toEqual(attempts[0]);
 expect((await workspace.call('GET','/studio-api/projects/'+project.id+'/agent-conversations',h)).json()).toHaveLength(1);
 let rejected=false;
 await page.route('**/studio-api/agent-conversations/*/notes',route=>{if(rejected)return route.fallback();rejected=true;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'REVISION_CONFLICT'})});});
 await page.getByLabel('Agent 任务描述',{exact:true}).fill('保存失败仍要保留的描述');await page.getByRole('button',{name:'保存 Agent 描述',exact:true}).click();
 await expect(page.getByLabel('Agent 任务描述',{exact:true})).toBeEnabled();await expect(page.getByLabel('Agent 任务描述',{exact:true})).toHaveValue('保存失败仍要保留的描述');
 await page.getByRole('button',{name:'保存 Agent 描述',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'描述已保存'})).toBeVisible();
 await page.getByRole('button',{name:'授权所选范围提出建议',exact:true}).click();await page.getByRole('dialog',{name:'确认 Agent 范围授权',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
 expect(workspace.providerCalls).toHaveLength(0);
});
