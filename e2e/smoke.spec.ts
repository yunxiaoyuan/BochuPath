import { expect, test } from '@playwright/test';

test('opens the seed diagram, switches modes and persists an edit', async ({ page }) => {
  await page.goto('/diagrams'); await expect(page.getByRole('heading', { name: '通路图库' })).toBeVisible();
  await page.getByRole('button', { name: '编辑 需求到交付示例' }).click(); await expect(page.getByLabel('通路图画布')).toBeVisible();
  await page.getByRole('treeitem', { name: '需求确认' }).click(); await expect(page.getByRole('heading', { name: '节点属性' })).toBeVisible();
  const name = page.getByLabel('节点名称'); await name.fill('需求澄清'); await page.getByRole('button', { name: '确定' }).click(); await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('✓ 已保存')).toBeVisible(); await page.reload(); await expect(page.getByText('需求澄清').first()).toBeVisible();
  await page.getByRole('button', { name: '查看', exact: true }).click(); await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
});
