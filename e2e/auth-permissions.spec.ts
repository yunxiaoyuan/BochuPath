import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:5182';
const api = '/api/bochupath/v1';
const identities = { reader: '只读体验员', editor: '编辑体验员', admin: '管理员体验员' };

async function login(page: Page, role: keyof typeof identities) {
  await page.goto('/diagrams');
  await expect(page.getByRole('heading', { name: '欢迎使用 BochuPath' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(identities[role]) }).click();
  await expect(page.getByRole('heading', { name: '通路图库' })).toBeVisible();
}

async function mutation(page: Page, path: string, method: string, data?: unknown, headers: Record<string, string> = {}) {
  const session = await page.request.get(`${api}/session`);
  expect(session.status()).toBe(200);
  const { csrfToken } = await session.json();
  return page.request.fetch(`${api}${path}`, {
    method, data,
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken, 'Idempotency-Key': randomUUID(), ...headers },
  });
}

async function openMembers(page: Page) {
  await page.goto('/access');
  await page.getByRole('tab', { name: '成员权限', exact: true }).click();
  await expect(page.getByRole('table', { name: '成员权限', exact: true })).toBeVisible();
}

async function revokeReader(page: Page) {
  await openMembers(page);
  await page.getByRole('row').filter({ hasText: 'dev-reader' }).getByRole('button', { name: '撤销权限' }).click();
  const dialog = page.getByRole('dialog', { name: '撤销成员权限' });
  await dialog.getByLabel('操作原因').fill('验收测试：撤销本轮临时编辑权限');
  await dialog.getByRole('button', { name: '确认撤销' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'dev-reader' })).toContainText('只读');
}

async function inviteReader(page: Page, message: string) {
  await openMembers(page);
  await page.getByRole('button', { name: '邀请成员', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '邀请成员' });
  await dialog.getByLabel('搜索企业内部成员').fill('dev-reader');
  await dialog.getByRole('radio', { name: /只读体验员/ }).check();
  await dialog.getByLabel('邀请说明').fill(message);
  await dialog.getByRole('button', { name: '发送邀请' }).click();
  await expect(dialog).toHaveCount(0);
}

test('session gate, server authorization, approval, save and revoked draft protection', async ({ browser }, testInfo) => {
  const adminContext = await browser.newContext({ baseURL: origin });
  const readerContext = await browser.newContext({ baseURL: origin });
  const admin = await adminContext.newPage();
  const reader = await readerContext.newPage();
  try {
    const unauthenticatedDiagramRequests: string[] = [];
    reader.on('request', request => { if (request.url().includes(`${api}/diagrams`)) unauthenticatedDiagramRequests.push(request.url()); });
    await reader.goto('/diagrams/private-id/edit');
    await expect(reader.getByRole('heading', { name: '欢迎使用 BochuPath' })).toBeVisible();
    expect(unauthenticatedDiagramRequests).toEqual([]);
    expect((await reader.request.get(`${api}/diagrams`)).status()).toBe(401);

    await login(admin, 'admin');
    const seedResponse = await mutation(admin, '/diagrams', 'POST', { name: '只读路由验收样例' });
    expect(seedResponse.status()).toBe(201);
    const seed = await seedResponse.json();
    await login(reader, 'reader');
    await expect(reader.getByRole('button', { name: /账号：只读体验员，只读/ })).toBeVisible();
    await expect(reader.getByRole('button', { name: /新建通路图/ })).toHaveCount(0);
    await reader.goto(`/diagrams/${seed.id}/edit`);
    await expect(reader).toHaveURL(new RegExp(`/diagrams/${seed.id}/view$`));
    await expect(reader.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
    await expect(reader.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
    const denied = await mutation(reader, '/diagrams', 'POST', { name: 'reader 不应创建成功' });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error.code).toBe('WRITE_PERMISSION_REQUIRED');
    expect((await reader.request.get(`${api}/admin/members`)).status()).toBe(403);

    await reader.getByRole('button', { name: '申请编辑权限', exact: true }).click();
    const requestDialog = reader.getByRole('dialog', { name: '申请编辑权限' });
    await requestDialog.getByLabel('申请原因', { exact: true }).fill('需要维护本次权限验收的通路图和节点内容');
    await requestDialog.getByRole('button', { name: '提交申请' }).click();
    await expect(requestDialog).toHaveCount(0);
    await expect(reader.getByRole('button', { name: '等待审批' })).toBeDisabled();
    await admin.goto('/access');
    await admin.getByRole('row').filter({ hasText: 'dev-reader' }).getByRole('button', { name: '审批', exact: true }).click();
    await admin.getByRole('dialog').getByRole('button', { name: '批准并开通' }).click();
    await expect(admin.getByText('申请已批准，编辑权限立即生效')).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole('button', { name: /账号：只读体验员，编辑者/ })).toBeVisible();
    await reader.goto('/diagrams');
    await reader.getByRole('button', { name: /新建通路图/ }).click();
    await reader.getByRole('dialog').getByLabel('通路图名称').fill('权限闭环验收图');
    await reader.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click();
    await expect(reader.getByLabel('通路图画布')).toBeVisible();
    const diagramId = new URL(reader.url()).pathname.split('/')[2];
    await reader.getByLabel('名称', { exact: true }).fill('权限闭环验收图－已保存');
    await reader.getByRole('button', { name: '确定', exact: true }).click();
    await reader.getByRole('button', { name: '保存', exact: true }).click();
    await expect(reader.getByText('✓ 已保存')).toBeVisible();
    await reader.reload();
    await expect(reader.getByLabel('名称', { exact: true })).toHaveValue('权限闭环验收图－已保存');

    await reader.getByLabel('名称', { exact: true }).fill('权限撤销后保留的个人草稿');
    await reader.getByRole('button', { name: '确定', exact: true }).click();
    await revokeReader(admin);
    const blockedSave = reader.waitForResponse(response => response.url().endsWith(`${api}/diagrams/${diagramId}`) && response.request().method() === 'PUT');
    await reader.getByRole('button', { name: '保存', exact: true }).click();
    const blockedResponse = await blockedSave;
    expect(blockedResponse.status()).toBe(403);
    expect((await blockedResponse.json()).error.code).toBe('PERMISSION_REVOKED');
    await expect(reader).toHaveURL(new RegExp(`/diagrams/${diagramId}/view$`));
    await expect(reader.getByText('当前为只读权限，可查看和导出通路图。')).toBeVisible();
    const draftKey = `bochupath:v2:draft:dev-reader:${diagramId}`;
    await expect.poll(() => reader.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').diagram?.name, draftKey)).toBe('权限撤销后保留的个人草稿');
    const saved = await reader.request.get(`${api}/diagrams/${diagramId}`);
    expect((await saved.json()).name).toBe('权限闭环验收图－已保存');
    await reader.screenshot({ path: testInfo.outputPath('revoked-reader-personal-draft.png'), fullPage: true });
    await admin.getByRole('tab', { name: '审计日志', exact: true }).click();
    await expect(admin.getByRole('table', { name: '权限与数据操作审计日志' })).toContainText('撤销权限');
    await admin.screenshot({ path: testInfo.outputPath('admin-audit-after-approval-revoke.png'), fullPage: true });
  } finally { await readerContext.close(); await adminContext.close(); }
});

test('invitation decline and accept, direct grant, and last administrator protection', async ({ browser }, testInfo) => {
  const adminContext = await browser.newContext({ baseURL: origin });
  const readerContext = await browser.newContext({ baseURL: origin });
  const admin = await adminContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await login(admin, 'admin');
    await login(reader, 'reader');
    const reset = await mutation(admin, '/admin/role-grants/dev-reader', 'DELETE', { reason: '验收场景初始化' });
    expect([200, 409]).toContain(reset.status());
    await inviteReader(admin, '验收邀请：先拒绝');
    await reader.reload();
    await reader.getByRole('button', { name: '拒绝邀请' }).click();
    await expect(reader.getByRole('button', { name: '拒绝邀请' })).toHaveCount(0);
    await expect(reader.getByRole('button', { name: /账号：只读体验员，只读/ })).toBeVisible();
    await inviteReader(admin, '验收邀请：接受获得编辑');
    await reader.reload();
    await reader.getByRole('button', { name: '接受邀请' }).click();
    await expect(reader.getByRole('button', { name: /账号：只读体验员，编辑者/ })).toBeVisible();
    await expect(reader.getByRole('button', { name: /新建通路图/ })).toBeVisible();
    await revokeReader(admin);
    await reader.reload();
    await expect(reader.getByRole('button', { name: /账号：只读体验员，只读/ })).toBeVisible();
    await admin.getByRole('row').filter({ hasText: 'dev-reader' }).getByRole('button', { name: '开通权限' }).click();
    const grantDialog = admin.getByRole('dialog', { name: '直接开通或调整权限' });
    await grantDialog.getByLabel('操作原因').fill('项目负责人直接开通编辑权限验收');
    await grantDialog.getByRole('button', { name: '下一步：确认权限' }).click();
    await grantDialog.getByRole('button', { name: '确认开通' }).click();
    await expect(grantDialog).toHaveCount(0);
    await reader.reload();
    await expect(reader.getByRole('button', { name: /账号：只读体验员，编辑者/ })).toBeVisible();

    await admin.getByRole('row').filter({ hasText: 'dev-admin' }).getByRole('button', { name: '撤销权限' }).click();
    const revokeDialog = admin.getByRole('dialog', { name: '撤销成员权限' });
    await revokeDialog.getByLabel('操作原因').fill('验证最后管理员必须受到保护');
    const protectedResponse = admin.waitForResponse(response => response.url().endsWith('/admin/role-grants/dev-admin') && response.request().method() === 'DELETE');
    await revokeDialog.getByRole('button', { name: '确认撤销' }).click();
    expect((await protectedResponse).status()).toBe(409);
    await expect(revokeDialog.getByRole('alert').last()).toContainText('最后');
    await admin.screenshot({ path: testInfo.outputPath('last-administrator-protected.png'), fullPage: true });
    await revokeDialog.getByRole('button', { name: '取消', exact: true }).click();
    await admin.getByRole('tab', { name: '邀请记录', exact: true }).click();
    await expect(admin.getByRole('table', { name: '邀请记录' })).toContainText('已接受');
    await expect(admin.getByRole('table', { name: '邀请记录' })).toContainText('已拒绝');
    await admin.screenshot({ path: testInfo.outputPath('invitation-history.png'), fullPage: true });
  } finally { await readerContext.close(); await adminContext.close(); }
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} login and administrator screens meet automatic WCAG checks`, async ({ page }, testInfo) => {
    await page.addInitScript(theme => localStorage.setItem('bochupath:theme', theme), theme);
    await page.goto('/diagrams');
    await expect(page.getByRole('heading', { name: '欢迎使用 BochuPath' })).toBeVisible();
    const loginA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(loginA11y.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`login-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: /管理员体验员/ }).click();
    await expect(page.getByRole('heading', { name: '通路图库' })).toBeVisible();
    await openMembers(page);
    const adminA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(adminA11y.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`members-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: '直接开通', exact: true }).click();
    await expect(page.getByRole('radio').first()).toBeVisible();
    const dialogA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(dialogA11y.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '直接开通', exact: true })).toBeFocused();
  });
}
