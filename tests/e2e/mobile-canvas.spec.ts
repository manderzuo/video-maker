import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '../helpers/cloud-workspace-ui-fixture';

test('selects phone nodes by touch and keeps selection separate from panning and editing', async ({ page, workspace, browserName }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 手机点选' } })).json();
    const textId = randomUUID(), videoId = randomUUID();
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [
        { id: randomUUID(), type: 'add_node', payload: { node: { id: textId, type: 'text', title: '点选正文', x: 40, y: 40, locked: false, data: { kind: 'text', text: 'TEST DATA 选中后编辑', referenceTokens: [] } } } },
        { id: randomUUID(), type: 'add_node', payload: { node: { id: videoId, type: 'video-generation', title: '点选视频', x: 440, y: 40, locked: false, data: { kind: 'video-generation', draft: { modelId: 'seedance', durationSeconds: 5, ratio: '9:16', resolution: '480p' }, inputBindings: [], stale: true } } } },
    ] } } })).statusCode).toBe(200);
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    await page.goto('/m/projects/' + project.id + '/canvas');
    const card = page.locator('[data-mobile-node-id="' + textId + '"]'), video = page.locator('[data-mobile-node-id="' + videoId + '"]'), stage = page.locator('.mobile-canvas-stage');
    await stage.scrollIntoViewIfNeeded();
    await card.tap();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: '已选中节点', exact: true })).toContainText('点选正文');
    await expect(page.getByRole('dialog', { name: '编辑节点正文', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: '编辑正文', exact: true }).click();
    await expect(page.getByLabel('节点正文', { exact: true })).toHaveValue('TEST DATA 选中后编辑');
    await page.getByRole('button', { name: '放弃编辑', exact: true }).click();
    await stage.scrollIntoViewIfNeeded();
    await video.tap();
    await expect(video).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('link', { name: '编辑视频草稿', exact: true })).toHaveAttribute('href', '/m/projects/' + project.id + '/video?node=' + videoId);
    await page.getByRole('button', { name: '取消选中', exact: true }).click();
    await stage.scrollIntoViewIfNeeded();
    if (browserName === 'chromium') {
        const box = (await card.boundingBox())!, cdp = await page.context().newCDPSession(page), x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y: y + 20, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(card).toHaveAttribute('aria-pressed', 'false');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 70, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 10, y, id: 1 }, { x: x + 90, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(card).toHaveAttribute('aria-pressed', 'false');
        await cdp.detach();
    }
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await page.getByRole('button', { name: '选中点选视频', exact: true }).click();
    await expect(page.getByRole('region', { name: '已选中节点', exact: true })).toContainText('点选视频');
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
    expect(workspace.providerCalls).toHaveLength(0);
});

test('renders owned image and video files in phone nodes and opens an unscaled preview', async ({ page, workspace, browserName }, testInfo) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 手机素材' } })).json();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nRAAAAAASUVORK5CYII=', 'base64'), clip = readFileSync(new URL('../fixtures/cloud-result-clip.mp4', import.meta.url));
    const ids: string[] = [];
    for (const [title, mimeType, bytes] of [['手机图片.png', 'image/png', image], ['手机视频.mp4', 'video/mp4', clip]] as const) {
        const reserved = await workspace.call('POST', '/studio-api/assets', { ...h, payload: { title, mimeType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
        expect(reserved.statusCode).toBe(201);
        const id = reserved.json().id; ids.push(id);
        expect((await workspace.app.inject({ method: 'PUT', url: '/studio-api/assets/' + id + '/content', payload: bytes, headers: { cookie: h.cookie, 'x-workspace-context': h.context, 'x-csrf-token': h.csrf, origin: 'https://studio.test', 'content-type': 'application/octet-stream' } })).statusCode).toBe(204);
        expect((await workspace.call('POST', '/studio-api/assets/' + id + '/complete', { ...h, payload: {} })).statusCode).toBe(200);
    }
    const nodeIds = [randomUUID(), randomUUID()];
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: nodeIds.map((id, index) => ({ id: randomUUID(), type: 'add_node', payload: { node: { id, title: index ? '视频素材节点' : '图片素材节点', type: 'asset', x: 40 + index * 400, y: 40, locked: false, data: { kind: 'asset', assetId: ids[index] } } } })) } } })).statusCode).toBe(200);
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    let unavailable = true;
    await page.route('**/studio-api/assets/' + ids[0] + '/files', route => unavailable ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'TEST DATA transient file failure' } }) }) : route.fallback());
    await page.goto('/m/projects/' + project.id + '/canvas');
    const imageCard = page.locator('[data-mobile-node-id="' + nodeIds[0] + '"]'), videoCard = page.locator('[data-mobile-node-id="' + nodeIds[1] + '"]');
    await expect(imageCard).toContainText('素材暂时无法读取');
    await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
    await imageCard.tap();
    await page.getByRole('button', { name: '查看素材', exact: true }).click();
    const failedPreview = page.getByRole('dialog', { name: '节点素材预览', exact: true });
    await expect(failedPreview).toContainText('素材暂时无法读取');
    unavailable = false;
    await failedPreview.getByRole('button', { name: '重新读取素材', exact: true }).click();
    await expect.poll(() => failedPreview.locator('img').evaluateAll(elements => elements.some(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect.poll(() => imageCard.locator('img').evaluateAll(elements => elements.some(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.getByRole('button', { name: '关闭节点素材预览', exact: true }).click();
    // Windows WebKit cannot decode this H.264 fixture; Chromium verifies a decoded frame and playback.
    if (browserName === 'chromium') await expect.poll(() => videoCard.locator('video').evaluateAll(elements => elements.some(element => (element as HTMLVideoElement).readyState >= 2 && (element as HTMLVideoElement).videoWidth > 0))).toBe(true);
    await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
    await imageCard.tap();
    await expect(imageCard).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '查看素材', exact: true }).click();
    const preview = page.getByRole('dialog', { name: '节点素材预览', exact: true });
    await expect(preview).toHaveClass(/mobile-dialog/);
    await expect.poll(() => preview.locator('img').evaluateAll(elements => elements.some(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.getByRole('button', { name: '关闭节点素材预览', exact: true }).click();
    await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
    await videoCard.tap();
    await page.getByRole('button', { name: '查看素材', exact: true }).click();
    if (browserName === 'chromium') {
        const player = preview.locator('video');
        await expect(player).toHaveAttribute('controls', '');
        await expect.poll(() => player.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
        await player.evaluate(element => (element as HTMLVideoElement).play());
        await expect.poll(() => player.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
        await player.evaluate(element => (element as HTMLVideoElement).pause());
    } else {
        testInfo.annotations.push({ type: 'media-limit', description: 'Windows WebKit does not decode the H.264 fixture; image, selection and error presentation verified. Real Safari playback remains device acceptance.' });
        await expect(preview.getByText('当前浏览器无法预览此文件，请下载原件查看。', { exact: true })).toBeVisible();
    }
    await expect(preview.getByRole('link', { name: '下载原件', exact: true })).toHaveAttribute('href', '/studio-api/assets/' + ids[1] + '/content?variant=original');
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
    expect(workspace.providerCalls).toHaveLength(0);
});
test('fits widely separated project nodes into the phone canvas on first open', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 宽画布' } })).json();
    const operations = [-5000, 5000].map((x, index) => ({ id: randomUUID(), type: 'add_node', payload: { node: { id: randomUUID(), type: 'text', title: '远处节点' + index, x, y: 40, locked: false, data: { kind: 'text', text: 'TEST DATA 原有内容' + index, referenceTokens: [] } } } }));
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations } } })).statusCode).toBe(200);
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    await page.addInitScript(key => sessionStorage.removeItem(key), 'aiwork:mobile-view:' + workspace.account.view.contextId + ':' + project.id);
    const cards = page.locator('.mobile-node-card');
    for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/m/projects/' + project.id + '/canvas');
        await expect(cards).toHaveCount(2);
        await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
        for (let index = 0; index < 2; index++) await expect(cards.nth(index)).toBeInViewport({ ratio: .95 });
    }
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑远处节点0', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    for (let index = 0; index < 2; index++) await expect(cards.nth(index)).toBeInViewport({ ratio: .95 });
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
});

test('fits loaded project content after the phone canvas obtains its real size', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 延迟布局' } })).json();
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'add_node', payload: { node: { id: randomUUID(), type: 'text', title: '延迟显示的节点', x: 5000, y: 4000, locked: false, data: { kind: 'text', text: 'TEST DATA 已有内容', referenceTokens: [] } } } }] } } })).statusCode).toBe(200);
    await page.addInitScript(() => {
        const attach = () => { if (!document.head) return false; const style = document.createElement('style'); style.id = 'test-delayed-canvas-layout'; style.textContent = '.mobile-canvas-stage{width:0!important;height:0!important}'; document.head.append(style); return true; };
        if (!attach()) { const observer = new MutationObserver(() => { if (attach()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
    });
    await page.goto('/m/projects/' + project.id + '/canvas');
    await expect(page.locator('.mobile-node-card')).toContainText('TEST DATA 已有内容');
    await page.evaluate(() => document.getElementById('test-delayed-canvas-layout')!.remove());
    await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
    await expect(page.locator('.mobile-node-card')).toBeInViewport({ ratio: .95 });
});

test('recovers an offscreen remembered mobile view instead of showing an empty canvas', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 失效视角' } })).json();
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'add_node', payload: { node: { id: randomUUID(), type: 'text', title: '已有正文', x: 5000, y: 4000, locked: false, data: { kind: 'text', text: 'TEST DATA 需要显示的正文', referenceTokens: [] } } } }] } } })).statusCode).toBe(200);
    await page.addInitScript(({ context, project }) => sessionStorage.setItem('aiwork:mobile-view:' + context + ':' + project, JSON.stringify({ x: 80000, y: 80000, scale: .25 })), { context: workspace.account.view.contextId, project: project.id });
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    await page.goto('/m/projects/' + project.id + '/canvas');
    const card = page.locator('.mobile-node-card');
    await expect(card).toContainText('TEST DATA 需要显示的正文');
    await page.locator('.mobile-canvas-stage').scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport({ ratio: .95 });
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
});

test('changes the rendered phone view with native one-finger pan and two-finger pinch', async ({ page, workspace, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Native multi-touch injection uses Chromium CDP; real iPhone acceptance is separate.');
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 实际触控' } })).json();
    const operations = [-5000, 5000].map(x => ({ id: randomUUID(), type: 'add_node', payload: { node: { id: randomUUID(), type: 'text', title: '触控节点', x, y: 40, locked: false, data: { kind: 'text', text: 'TEST DATA 正文', referenceTokens: [] } } } }));
    expect((await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations } } })).statusCode).toBe(200);
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/m/projects/' + project.id + '/canvas');
    await expect(page.locator('.mobile-node-card')).toHaveCount(2);
    const stage = page.locator('.mobile-canvas-stage'), world = page.locator('.mobile-canvas-world');
    await stage.scrollIntoViewIfNeeded();
    const read = () => world.evaluate(element => { const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform); return { x: matrix.e, y: matrix.f, scale: matrix.a }; });
    const initial = await read(), box = (await stage.boundingBox())!, cdp = await page.context().newCDPSession(page), x = Math.round(box.x + 60), y = Math.round(box.y + 60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y: y + 40, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.abs((await read()).x - initial.x - 60)).toBeLessThan(.1);
    await expect.poll(async () => Math.abs((await read()).y - initial.y - 40)).toBeLessThan(.1);
    const panned = await read();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 120, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 150, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.abs((await read()).scale - panned.scale * 1.5)).toBeLessThan(.0001);
    const zoomed = await read();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 150, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }, { x: x + 120, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.abs((await read()).scale - zoomed.scale * 2 / 3)).toBeLessThan(.0001);
    await cdp.detach();
    expect(errors).toEqual([]);
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('phone-canvas-touch.png') });
    const remembered = await read();
    await page.reload();
    await expect(page.locator('.mobile-node-card')).toHaveCount(2);
    await expect.poll(async () => Math.abs((await read()).x - remembered.x)).toBeLessThan(.1);
    await expect.poll(async () => Math.abs((await read()).scale - remembered.scale)).toBeLessThan(.0001);
});

test('observes a mobile canvas without changing cloud geometry and edits only its text', async ({ page, context, workspace, browserName }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 手机画布' } })).json(), nodeId = randomUUID();
    await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'add_node', payload: { node: { id: nodeId, type: 'text', title: '正文节点', x: 40, y: 60, locked: false, data: { kind: 'text', text: 'TEST DATA 原正文', referenceTokens: [] } } } }] } } });
    const before = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    await page.goto('/m/projects/' + project.id + '/canvas');
    await expect(page.getByRole('heading', { name: '手机画布', exact: true })).toBeVisible();
    const stage = page.locator('.mobile-canvas-stage');
    await expect(stage).toBeVisible();
    if (browserName === 'chromium') {
        const box = (await stage.boundingBox())!, cdp = await page.context().newCDPSession(page), x = Math.round(box.x + box.width * .6), y = Math.round(box.y + box.height * .7);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60, y: y - 40, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 50, y, id: 1 }, { x: x + 20, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 70, y, id: 1 }, { x: x + 50, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
    }
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await expect(page.locator('.mobile-minimap')).toBeVisible();
    const map = (await page.locator('.mobile-minimap').boundingBox())!;
    await page.mouse.move(map.x + 30, map.y + 30);
    await page.mouse.down();
    await page.mouse.move(map.x + 80, map.y + 45);
    await page.mouse.up();
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json()).toEqual(before);
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑正文节点', exact: true }).click();
    await page.getByLabel('节点正文', { exact: true }).fill('TEST DATA 手机修改正文');
    let offline = true, failedChecks = 0;
    const sessionRoute: Parameters<typeof context.route>[1] = route => { if (offline) { failedChecks++; return route.abort('failed'); } return route.fallback(); };
    await context.route('**/studio-api/session', sessionRoute);
    await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); return failedChecks; }).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '编辑节点正文', exact: true })).not.toBeVisible();
    offline = false;
    await page.getByRole('button', { name: '重新检查登录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑节点正文', exact: true }).getByLabel('节点正文', { exact: true })).toHaveValue('TEST DATA 手机修改正文');
    await context.unroute('**/studio-api/session', sessionRoute);
    await page.getByRole('button', { name: '保存节点正文', exact: true }).click();
    await expect(page.getByText('正文已保存', { exact: true })).toBeVisible();
    const after = (await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json();
    expect(after.nodes[0].data.text).toBe('TEST DATA 手机修改正文');
    expect(after.nodes[0].x).toBe(40);
    expect(after.nodes[0].y).toBe(60);
    expect(after.viewport).toEqual(before.viewport);
    expect(after.edges).toEqual(before.edges);
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
    await page.goto('/projects/' + project.id + '/canvas');
    await expect(page.locator('[data-interaction-id="cloud:canvas:node-text"]').first()).toHaveValue('TEST DATA 手机修改正文');
});
test('shows existing canvas relationships in the mobile overview', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 手机连线' } })).json(), source = randomUUID(), target = randomUUID();
    const created = await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'add_node', payload: { node: { id: source, type: 'text', title: '文字', x: 40, y: 40, locked: false, data: { kind: 'text', text: 'TEST DATA 提示词', referenceTokens: [] } } } }, { id: randomUUID(), type: 'add_node', payload: { node: { id: target, type: 'video-generation', title: '视频', x: 440, y: 40, locked: false, data: { kind: 'video-generation', draft: { modelId: 'seedance', durationSeconds: 5, ratio: '9:16', resolution: '480p' }, inputBindings: [], stale: true } } } }, { id: randomUUID(), type: 'add_edge', payload: { edge: { id: randomUUID(), sourceId: source, targetId: target, port: 'text', order: 0 } } }] } } });
    expect(created.statusCode).toBe(200);
    await page.goto('/m/projects/' + project.id + '/canvas');
    await expect(page.locator('.mobile-canvas-wire')).toHaveCount(1);
    expect(workspace.providerCalls.filter(call => call.method === 'POST')).toHaveLength(0);
});
test('retains a conflicting mobile text edit and guards browser refresh', async ({ page, workspace }) => {
    const h = workspace.headers(workspace.account), project = (await workspace.call('POST', '/studio-api/projects', { ...h, payload: { title: 'TEST DATA 正文冲突' } })).json(), id = randomUUID();
    await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 0, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'add_node', payload: { node: { id, type: 'text', title: '正文节点', x: 40, y: 60, locked: false, data: { kind: 'text', text: 'TEST DATA 初始', referenceTokens: [] } } } }] } } });
    await page.goto('/m/projects/' + project.id + '/canvas');
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await page.getByRole('button', { name: '编辑正文节点', exact: true }).click();
    const input = page.getByLabel('节点正文', { exact: true });
    await input.fill('TEST DATA 手机修改');
    await workspace.call('POST', '/studio-api/projects/' + project.id + '/commands', { ...h, payload: { expectedRevision: 1, idempotencyKey: randomUUID(), command: { type: 'operations', operations: [{ id: randomUUID(), type: 'update_node', payload: { nodeId: id, patch: { data: { kind: 'text', text: 'TEST DATA 电脑新正文', referenceTokens: [] } } } }] } } });
    await page.getByRole('button', { name: '保存节点正文', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑节点正文', exact: true }).getByRole('alert')).toBeVisible();
    await expect(input).toHaveValue('TEST DATA 手机修改');
    expect((await workspace.call('GET', '/studio-api/projects/' + project.id + '/graph', h)).json().nodes[0].data.text).toBe('TEST DATA 电脑新正文');
    expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
});
