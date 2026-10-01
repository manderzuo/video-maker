import type {Page} from '@playwright/test';
export const visualViews=[
 {id:'P01',path:'/welcome'},{id:'P02',path:'/projects'},{id:'P03',path:'/projects/p1/canvas'},{id:'P04',path:'/assets'},{id:'P05',path:'/prompts'},{id:'P06',path:'/tasks'},
 {id:'P07',path:'/projects/p1/results?runId=r1'},{id:'P08',path:'/projects/p1/compare?runs=r1,r2'},{id:'P09',path:'/projects/p1/agent'},
 {id:'P10',path:'/settings/connections'},{id:'P11',path:'/settings/models'},{id:'P12',path:'/settings/appearance'},{id:'P13',path:'/settings/storage'},{id:'P14',path:'/projects/packages'},
 {id:'P15',path:'/activity'},{id:'P16',path:'/help'},{id:'P17',path:'/trash'},{id:'P18',path:'/settings/capabilities'},{id:'P19',path:'/settings/backup'},{id:'P20',path:'/recovery'},
 {id:'P21',path:'/prompt-generator?type=video&draftId=visual-draft'},{id:'P22',path:'/projects/p1/canvas'},{id:'P23',path:'/prompt-generator?type=video&draftId=visual-draft'},
] as const;
export async function seedVisualRuntime(page:Page){
 await page.goto('/projects');await page.evaluate(async()=>{localStorage.setItem('aiwork-studio:onboarding','1');const r='/tests/fixtures/result-review.ts',d='/src/features/prompt-generation/draft-repository.ts',f='/tests/helpers/fixtures.ts';await(await import(r)).seedResultReview();const result=await(await import(d)).saveDraft((await import(f)).f.draft({id:'visual-draft',revision:0,userRequest:'康济健葆，1位人物，不切镜，5秒、9:16',requestedSpec:{durationSeconds:5,ratio:'9:16'}}),0);if(result.status!=='saved')throw Error('visual_draft_not_saved');});await page.goto('/prompt-generator?type=video&draftId=visual-draft');await page.getByRole('button',{name:'本地整理',exact:true}).click();await page.getByLabel('最终提示词正文',{exact:true}).waitFor();
}
export async function openVisualView(page:Page,view:typeof visualViews[number]){
 await page.goto(view.path);await page.waitForLoadState('networkidle');
 if(view.id==='P18')await page.getByLabel('显示未开放能力说明',{exact:true}).check();
 if(view.id==='P22'){await page.getByRole('button',{name:'提示词生成面板',exact:true}).click();await page.getByRole('complementary',{name:'提示词生成面板',exact:true}).waitFor();}
 if(view.id==='P23'){await page.getByRole('button',{name:'查看历史',exact:true}).click();await page.getByRole('dialog').waitFor();}
 await page.evaluate(()=>document.fonts.ready);
}
export async function viewportEvidence(page:Page){return page.evaluate(()=>({innerWidth,innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,bodyFont:getComputedStyle(document.body).fontSize,theme:document.documentElement.dataset.theme,dialogBounds:Array.from(document.querySelectorAll('dialog[open]')).map(element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})}));}
