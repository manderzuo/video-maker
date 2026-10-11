import { test, expect } from '../helpers/cloud-workspace-ui-fixture';
test('prefers login at anonymous web entry and keeps registration an explicit choice', async ({ page, context }) => {
    await context.route('**/studio-api/session', route => route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }));
    await context.route('**/studio-api/auth/bootstrap', route => route.fulfill({ json: { csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() } }));
    const privateRequests: string[] = [];
    page.on('request', request => { if (/\/studio-api\/(projects|me\/document)/.test(new URL(request.url()).pathname)) privateRequests.push(request.url()); });
    for (const path of ['/', '/projects', '/m', '/m/projects']) {
        await page.goto(path);
        await expect(page).toHaveURL(path.startsWith('/m') ? /\/m\/login\?returnTo=/ : /\/login$/);
        await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
        await page.getByRole('link', { name: '注册', exact: true }).click();
        await expect(page.getByRole('heading', { name: '注册', exact: true })).toBeVisible();
        await page.getByRole('link', { name: '登录', exact: true }).click();
        await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
    }
    expect(privateRequests).toEqual([]);
});
test('keeps mobile navigation separate from desktop page memory', async ({ page, apiModel }) => {
    const memoryWrites: unknown[] = [];
    page.on('request', request => { if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/studio-api/me/document')
        memoryWrites.push(request.postDataJSON()); });
    await page.goto('/m/projects');
    await expect(page.getByRole('navigation', { name: '手机主导航', exact: true })).toBeVisible();
    await expect(page.locator('.account-shell')).toHaveCount(0);
    await page.getByRole('link', { name: '创作', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/prompt-generator$/);
    await page.getByRole('link', { name: '素材', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/assets$/);
    await page.getByRole('link', { name: '任务', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/tasks$/);
    await page.getByRole('link', { name: '我的', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/me$/);
    expect(apiModel.document.lastVisitedPage).toBe('/projects');
    expect(memoryWrites).toEqual([]);
    await page.getByRole('link', { name: '返回桌面版', exact: true }).click();
    await expect(page.locator('.account-shell')).toBeVisible();
    await expect(page.locator('.mobile-workspace')).toHaveCount(0);
    await expect(page.locator('.mobile-dialog')).toHaveCount(0);
});
test('marks mobile portal dialogs and restores ordinary desktop dialogs', async ({ page }) => {
    await page.goto('/m/projects');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
    await expect(dialog).toHaveClass(/mobile-dialog/);
    await expect(dialog).toBeInViewport();
    await page.getByLabel('项目名称', { exact: true }).fill('TEST DATA 手机项目');
    await page.getByRole('button', { name: '创建项目', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'TEST DATA 手机项目', exact: true })).toHaveAttribute('href', /\/m\/projects\/.+\/canvas/);
    await page.getByRole('link', { name: '我的', exact: true }).click();
    await page.getByRole('link', { name: '返回桌面版', exact: true }).click();
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).not.toHaveClass(/mobile-dialog/);
});
test('does not load mobile code or change layout on ordinary narrow desktop routes', async ({ page }) => {
    const mobileRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('/features/mobile/'))
        mobileRequests.push(request.url()); });
    await page.setViewportSize({ width: 720, height: 900 });
    await page.goto('/projects');
    await expect(page.locator('.account-shell')).toBeVisible();
    await expect(page.locator('.mobile-workspace')).toHaveCount(0);
    expect(mobileRequests).toEqual([]);
});
test('keeps mobile controls inside a reduced visual viewport without losing input focus', async ({ page }) => {
    await page.addInitScript(() => { const visual = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }); Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual }); });
    await page.goto('/m/projects');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    const input = page.getByLabel('项目名称', { exact: true });
    await input.fill('TEST DATA 键盘输入');
    await page.evaluate(() => { Object.assign(window.visualViewport!, { height: 460, offsetTop: 0 }); window.visualViewport!.dispatchEvent(new Event('resize')); });
    await expect.poll(async () => { const box = await page.getByRole('navigation', { name: '手机主导航', exact: true }).boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(461);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('TEST DATA 键盘输入');
    const box = (await page.getByRole('dialog', { name: '新建项目', exact: true }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(461);
});
test('retains the mobile return route through login, registration, expiry and logout', async ({ page, context, apiModel }) => {
    let signed = false;
    await context.route('**/studio-api/session', route => signed ? route.fulfill({ json: apiModel.session }) : route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }));
    await context.route('**/studio-api/auth/**', route => { const path = new URL(route.request().url()).pathname; if (path.endsWith('/bootstrap'))
        return route.fulfill({ json: { csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() } }); if (path.endsWith('/logout')) {
        signed = false;
        return route.fulfill({ status: 204 });
    } signed = true; return route.fulfill({ json: apiModel.session }); });
    await page.goto('/m/tasks');
    await expect(page).toHaveURL(/\/m\/login\?returnTo=/);
    await page.getByRole('link', { name: '注册', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/register\?returnTo=%2Fm%2Ftasks/);
    await page.getByRole('link', { name: '登录', exact: true }).click();
    await page.getByLabel('用户名', { exact: true }).fill('Cloud_UI_A');
    await page.getByLabel('密码', { exact: true }).fill('FAKE_MOBILE_PASSWORD');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/tasks$/);
    signed = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL(/\/m\/login\?returnTo=%2Fm%2Ftasks/);
    await page.getByLabel('用户名', { exact: true }).fill('Cloud_UI_A');
    await page.getByLabel('密码', { exact: true }).fill('FAKE_MOBILE_PASSWORD');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/tasks$/);
    await page.getByRole('link', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/login\?returnTo=/);
    expect(apiModel.document.lastVisitedPage).toBe('/projects');
});
test('shows a mobile authentication error after the form is remounted', async ({ page, context }) => {
    await context.route('**/studio-api/session', route => route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }));
    await context.route('**/studio-api/auth/bootstrap', route => route.fulfill({ json: { csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() } }));
    await context.route('**/studio-api/auth/login', route => route.fulfill({ status: 401, json: { code: 'AUTH_INVALID' } }));
    await page.goto('/m/login');
    await page.getByLabel('用户名', { exact: true }).fill('Cloud_UI_A');
    await page.getByLabel('密码', { exact: true }).fill('FAKE_MOBILE_PASSWORD');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.mobile-content [role="alert"]')).toBeVisible();
});
