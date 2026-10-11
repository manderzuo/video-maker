import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/cloud-workspace-ui-fixture';
test('retains mobile writing, focus and resolution across tabs and rotation', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), draft = (await workspace.call('POST', '/studio-api/prompt-drafts', { ...h, payload: { type: 'video', userRequest: 'TEST DATA 初始创意', sceneId: 'text', requestedSpec: {}, audioPlan: '', lockedConstraints: [], references: [], ruleVersion: 'studio-video-rules-v1', idempotencyKey: randomUUID() } })).json();
    await page.goto('/m/prompt-generator?draft=' + draft.id);
    const input = page.getByLabel('原始创意', { exact: true });
    await expect(input).toHaveValue('TEST DATA 初始创意');
    await input.fill('TEST DATA 猴子出现在1-2秒，熊猫出现在3-4秒');
    await page.getByLabel('清晰度目标', { exact: true }).selectOption('720p');
    await page.getByRole('tab', { name: '结果', exact: true }).click();
    await expect(input).not.toBeVisible();
    await page.getByRole('tab', { name: '历史', exact: true }).click();
    await page.getByRole('tab', { name: '输入', exact: true }).click();
    await expect(input).toHaveValue('TEST DATA 猴子出现在1-2秒，熊猫出现在3-4秒');
    await input.focus();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('TEST DATA 猴子出现在1-2秒，熊猫出现在3-4秒');
    await expect.poll(async () => (await workspace.call('GET', '/studio-api/prompt-drafts/' + draft.id, h)).json().requestedSpec.resolution).toBe('720p');
    await page.reload();
    await expect(page.getByLabel('清晰度目标', { exact: true })).toHaveValue('720p');
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
});
test('keeps newer mobile typing while an automatic save is pending', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), draft = (await workspace.call('POST', '/studio-api/prompt-drafts', { ...h, payload: { type: 'video', userRequest: 'TEST DATA 初始', sceneId: 'text', requestedSpec: {}, audioPlan: '', lockedConstraints: [], references: [], ruleVersion: 'studio-video-rules-v1', idempotencyKey: randomUUID() } })).json();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let held = false;
    await page.route('**/studio-api/prompt-drafts/' + draft.id, async (route) => { if (route.request().method() === 'PATCH' && !held) {
        held = true;
        await gate;
    } await route.fallback(); });
    try {
        await page.goto('/m/prompt-generator?draft=' + draft.id);
        const input = page.getByLabel('原始创意', { exact: true });
        await expect(input).toHaveValue('TEST DATA 初始');
        await input.fill('TEST DATA 第一段');
        await expect.poll(() => held).toBe(true);
        await input.press('End');
        await input.pressSequentially('继续输入');
        release();
        await expect(input).toHaveValue('TEST DATA 第一段继续输入');
        await expect(input).toBeFocused();
        await expect.poll(async () => (await workspace.call('GET', '/studio-api/prompt-drafts/' + draft.id, h)).json().userRequest).toBe('TEST DATA 第一段继续输入');
    }
    finally {
        release();
    }
});
test('retains mobile input on a conflict with a desktop edit', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), draft = (await workspace.call('POST', '/studio-api/prompt-drafts', { ...h, payload: { type: 'video', userRequest: 'TEST DATA 初始', sceneId: 'text', requestedSpec: {}, audioPlan: '', lockedConstraints: [], references: [], ruleVersion: 'studio-video-rules-v1', idempotencyKey: randomUUID() } })).json();
    await page.goto('/m/prompt-generator?draft=' + draft.id);
    const input = page.getByLabel('原始创意', { exact: true });
    await expect(input).toHaveValue('TEST DATA 初始');
    await workspace.call('PATCH', '/studio-api/prompt-drafts/' + draft.id, { ...h, payload: { expectedRevision: 0, userRequest: 'TEST DATA 电脑端新正文' } });
    await input.fill('TEST DATA 手机未保存正文');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(input).toHaveValue('TEST DATA 手机未保存正文');
    await expect(input).toBeFocused();
    expect((await workspace.call('GET', '/studio-api/prompt-drafts/' + draft.id, h)).json().userRequest).toBe('TEST DATA 电脑端新正文');
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
});
test('waits for composition completion before automatically saving mobile input', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), draft = (await workspace.call('POST', '/studio-api/prompt-drafts', { ...h, payload: { type: 'video', userRequest: 'TEST DATA 初始', sceneId: 'text', requestedSpec: {}, audioPlan: '', lockedConstraints: [], references: [], ruleVersion: 'studio-video-rules-v1', idempotencyKey: randomUUID() } })).json();
    await page.clock.install();
    await page.goto('/m/prompt-generator?draft=' + draft.id);
    const input = page.getByLabel('原始创意', { exact: true });
    await expect(input).toHaveValue('TEST DATA 初始');
    await input.dispatchEvent('compositionstart');
    await input.fill('TEST DATA 中文合成输入');
    await page.clock.fastForward(4000);
    expect((await workspace.call('GET', '/studio-api/prompt-drafts/' + draft.id, h)).json().userRequest).toBe('TEST DATA 初始');
    await input.dispatchEvent('compositionend');
    await page.clock.fastForward(4000);
    await expect.poll(async () => (await workspace.call('GET', '/studio-api/prompt-drafts/' + draft.id, h)).json().userRequest).toBe('TEST DATA 中文合成输入');
    await expect(input).toBeFocused();
});
