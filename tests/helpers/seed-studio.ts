import type {Page} from '@playwright/test';
export type SeedScenario='minimal-project'|'submit-unknown'|'newer-project-schema'|'storage-persistence-denied';
export async function seedStudio(page:Page,scenario:SeedScenario){
 await page.evaluate(async name=>{const modulePath='/tests/fixtures/storage-fixture.ts';const fixture=await import(modulePath);await fixture.seedScenario(name);},scenario);
}
