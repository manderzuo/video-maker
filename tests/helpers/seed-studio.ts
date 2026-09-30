import type {Page} from '@playwright/test';
export type SeedScenario='minimal-project'|'submit-unknown'|'newer-project-schema'|'storage-persistence-denied'|'project-library'|'canvas-project'|'unverified-capability';
export async function seedStudio(page:Page,scenario:SeedScenario){
 if(!page.url().startsWith('http://127.0.0.1:4179'))await page.goto('/projects');
 await page.evaluate(async name=>{const modulePath=['project-library','canvas-project','unverified-capability'].includes(name)?'/tests/fixtures/seed.ts':'/tests/fixtures/storage-fixture.ts';const fixture=await import(modulePath);await fixture.seedScenario(name);},scenario);
}
