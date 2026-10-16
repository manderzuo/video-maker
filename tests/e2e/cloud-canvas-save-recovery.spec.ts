import {randomUUID} from 'node:crypto';
import {test,expect} from '../helpers/cloud-workspace-ui-fixture';
test('a large existing graph saves one new node with a small authoritative response',async({page,workspace})=>{
 const h=workspace.headers(workspace.account),p=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 大画布保存'}})).json();
 const nodes=Array.from({length:100},(_,i)=>({id:randomUUID(),type:'text',title:'TEST DATA '+i,x:10000+i*400,y:10000,locked:false,data:{kind:'text',text:('TEST DATA '+i+' ').repeat(500),referenceTokens:[]}}));
 const seed=await workspace.call('POST','/studio-api/projects/'+p.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}}))}}});expect(seed.statusCode).toBe(200);expect(seed.rawPayload.length).toBeGreaterThan(500000);
 await page.goto('/projects/'+p.id+'/canvas');await expect(page.getByRole('status').first()).toContainText('已保存');
 const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/projects/'+p.id+'/commands'));
 await page.getByRole('button',{name:'添加文字节点',exact:true}).click();const saved=await response,body=await saved.json();expect(saved.status()).toBe(200);expect(body).not.toHaveProperty('graph');expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(2500);
 await expect(page.getByRole('status').first()).toContainText('已保存');expect((await workspace.call('GET','/studio-api/projects/'+p.id+'/workspace',h)).json().graph.nodes).toHaveLength(101);expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});

for(const lostResponse of [false,true])test('clears the failed connection-save banner after an identical retry succeeds and persists the edge; lost response='+lostResponse,async({page,workspace})=>{
 const h=workspace.headers(workspace.account),p=(await workspace.call('POST','/studio-api/projects',{...h,payload:{title:'TEST DATA 保存恢复'}})).json();
 const text=randomUUID(),video=randomUUID();
 const nodes=[{id:text,type:'text',title:'TEST DATA 正文',x:24,y:24,locked:false,data:{kind:'text',text:'TEST DATA 已保留正文',referenceTokens:[]}},{id:video,type:'video-generation',title:'TEST DATA 视频',x:440,y:24,locked:false,data:{kind:'video-generation',draft:{modelId:'seedance'},inputBindings:[],stale:true}}];
 expect((await workspace.call('POST','/studio-api/projects/'+p.id+'/commands',{...h,payload:{expectedRevision:0,idempotencyKey:randomUUID(),command:{type:'operations',operations:nodes.map(node=>({id:randomUUID(),type:'add_node',payload:{node}}))}}})).statusCode).toBe(200);
 const requests:unknown[]=[];let fail=true;
 await page.route('**/studio-api/projects/'+p.id+'/commands',async route=>{const payload=route.request().postDataJSON();requests.push(payload);if(fail){fail=false;if(lostResponse){expect((await workspace.call('POST','/studio-api/projects/'+p.id+'/commands',{...h,payload})).statusCode).toBe(200);return route.abort('failed');}return route.fulfill({status:500,json:{code:'INTERNAL_ERROR'}});}return route.fallback();});
 await page.goto('/projects/'+p.id+'/canvas');
 await page.getByRole('button',{name:'输出文本',exact:true}).press('Enter');await page.getByRole('button',{name:'接收文本',exact:true}).click();
 await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeEnabled();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'重试保存',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('已保存');
 await expect(page.getByRole('alert')).toHaveCount(0);
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
 expect((await workspace.call('GET','/studio-api/projects/'+p.id+'/workspace',h)).json().graph.revision).toBe(2);
 await page.reload();await expect(page.locator('.canvas-wire')).toHaveCount(1);
 await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('TEST DATA 已保留正文');
 expect(workspace.providerCalls.filter(call=>call.method==='POST')).toHaveLength(0);
});
