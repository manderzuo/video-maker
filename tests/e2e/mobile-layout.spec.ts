import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/cloud-workspace-ui-fixture';
test('keeps mobile page controls within phone and tablet widths', async ({ page, workspace }, testInfo) => {
    const h = workspace.headers(workspace.account), draft = (await workspace.call('POST', '/studio-api/prompt-drafts', { ...h, payload: { type: 'video', userRequest: 'TEST DATA 手机排版', sceneId: 'text', requestedSpec: {}, audioPlan: '', lockedConstraints: [], references: [], ruleVersion: 'studio-video-rules-v1', idempotencyKey: randomUUID() } })).json();
    const routes = [['projects', '/m/projects'], ['writing', '/m/prompt-generator?draft=' + draft.id], ['assets', '/m/assets'], ['tasks', '/m/tasks'], ['me', '/m/me'], ['settings', '/m/settings/connections']];
    test.setTimeout(60000);
    for (const [width, height] of [[360,800],[390,844],[430,932],[844,390],[768,1024],[1024,768]]) {
        await page.setViewportSize({ width, height });
        for (const [name, path] of routes) {
            await page.goto(path);
            await expect(page.locator('.mobile-workspace')).toBeVisible();
            await expect(page.locator('.mobile-content h1').first()).toBeVisible();
            await expect(page.getByRole('navigation', { name: '手机主导航', exact: true })).toBeInViewport();
            const outside = await page.locator('.mobile-content').evaluate((root, width) => [...root.querySelectorAll('input,select,textarea,button')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.right > width + 1 || box.left < -1); }).map(element => element.getAttribute('aria-label') ?? element.textContent?.slice(0, 50)), width);
            expect(outside).toEqual([]);
            await page.screenshot({ path: testInfo.outputPath(name + '-' + width + 'x' + height + '.png') });
        }
    }
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
});
