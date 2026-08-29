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

  await page.getByLabel("切换到深色主题").click();
  await page.waitForTimeout(200);
  const darkResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(darkResult.violations).toEqual([]);
});
