import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("light and dark edit workspaces have no automatically detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await expect(page.getByLabel("通路图画布")).toBeVisible();

  const lightResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(lightResult.violations).toEqual([]);

  await page.getByTitle("批量添加层级或节点").click();
  await page.getByLabel("节点名称列表").fill("需求提出；需求分析");
  const batchResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(batchResult.violations).toEqual([]);

  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("tab", { name: "通路" }).click();
  await page.getByRole("button", { name: /新增通路/ }).click();
  await page.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await expect(page.getByText(/已选 1 个节点 · 1 层/)).toBeVisible();
  const pathwayDraftResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(pathwayDraftResult.violations).toEqual([]);

  await page.getByLabel("切换到深色主题").click();
  await page.waitForTimeout(200);
  const darkResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(darkResult.violations).toEqual([]);
});
