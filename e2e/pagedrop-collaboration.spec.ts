import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import { createDemoDiagram } from "../src/domain/seed";
import type { BochuPathSharedState } from "../src/persistence/pagedrop";

test("PageDrop collaborators share saves and stale saves keep a local draft", async ({
  browser,
}) => {
  let sharedState: BochuPathSharedState = {
    schemaVersion: "1.0",
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
    lastMutationId: "seed_v1",
    diagrams: [createDemoDiagram()],
  };
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  await installSharedJsonRoute(aliceContext, () => sharedState, (next) => { sharedState = next; });
  await installSharedJsonRoute(bobContext, () => sharedState, (next) => { sharedState = next; });
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const url = "/api/link/test/files/index.html#/diagrams/diagram_demo/edit";

  await Promise.all([alice.goto(url), bob.goto(url)]);
  await expect(alice.getByText(/共享数据/)).toBeVisible();
  await expect(bob.getByRole("treeitem", { name: "需求确认" })).toBeVisible();

  await alice.getByRole("treeitem", { name: "需求确认" }).click();
  await alice.getByLabel("节点名称").fill("Alice 已确认需求");
  await alice.getByRole("button", { name: "确定" }).click();
  await alice.getByRole("button", { name: "保存", exact: true }).click();
  await expect(alice.getByText("✓ 已保存")).toBeVisible();

  await bob.getByRole("treeitem", { name: "需求确认" }).click();
  await bob.getByLabel("节点名称").fill("Bob 的旧版本");
  await bob.getByRole("button", { name: "确定" }).click();
  await bob.getByRole("button", { name: "保存", exact: true }).click();
  await expect(bob.getByText(/共享版本已更新/)).toBeVisible();
  await bob.waitForTimeout(650);

  await bob.reload();
  await expect(bob.getByText("发现比上次保存更新的本地草稿。")).toBeVisible();
  await bob.getByRole("button", { name: "放弃草稿" }).click();
  await expect(bob.getByRole("treeitem", { name: "Alice 已确认需求" })).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("PageDrop Inspector confirms layer, node and batch creation", async ({
  browser,
  baseURL,
}) => {
  let sharedState: BochuPathSharedState = {
    schemaVersion: "1.0",
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
    lastMutationId: "seed_v1",
    diagrams: [createDemoDiagram()],
  };
  const context = await browser.newContext();
  await installSharedJsonRoute(context, () => sharedState, (next) => { sharedState = next; });
  const page = await context.newPage();
  await page.setContent(
    `<iframe title="PageDrop app" sandbox="allow-scripts allow-same-origin" style="width:1400px;height:800px" src="${baseURL}/api/link/test/files/index.html#/diagrams/diagram_demo/edit"></iframe>`,
  );
  const app = page.frameLocator('iframe[title="PageDrop app"]');
  const objectPanel = app.getByRole("complementary", { name: "对象面板" });

  await objectPanel.getByRole("button", { name: "＋ 层级" }).click();
  await app.getByLabel("层级名称").fill("回归测试层级");
  await app.getByRole("button", { name: "确定" }).click();
  await expect(app.getByRole("treeitem", { name: /回归测试层级/ })).toBeVisible();

  await objectPanel.getByRole("button", { name: "＋ 节点" }).click();
  await app.getByLabel("节点名称").fill("回归测试节点");
  await app.getByRole("button", { name: "确定" }).click();
  await expect(app.getByRole("treeitem", { name: "回归测试节点" })).toBeVisible();

  await objectPanel.getByRole("button", { name: "批量" }).click();
  await app.getByLabel("节点名称列表").fill("批量节点甲；批量节点乙");
  await app.getByRole("button", { name: "确定" }).click();
  await expect(app.getByRole("treeitem", { name: "批量节点甲" })).toBeVisible();
  await expect(app.getByRole("treeitem", { name: "批量节点乙" })).toBeVisible();

  await context.close();
});

test("PageDrop sandbox creates a runnable blank diagram", async ({
  browser,
  baseURL,
}) => {
  let sharedState: BochuPathSharedState = {
    schemaVersion: "1.0",
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
    lastMutationId: "seed_v1",
    diagrams: [createDemoDiagram()],
  };
  const context = await browser.newContext();
  await installSharedJsonRoute(context, () => sharedState, (next) => { sharedState = next; });
  const page = await context.newPage();
  await page.setContent(
    `<iframe title="PageDrop gallery" sandbox="allow-scripts allow-same-origin" style="width:1400px;height:800px" src="${baseURL}/api/link/test/files/index.html#/diagrams"></iframe>`,
  );
  const app = page.frameLocator('iframe[title="PageDrop gallery"]');

  await app.getByRole("button", { name: /从空白图开始/ }).click();
  await app.getByLabel("通路图名称").fill("Sandbox 空白图");
  await app.getByRole("button", { name: "创建", exact: true }).click();

  await expect(app.getByLabel("通路图画布")).toBeVisible();
  await expect(app.getByText("Sandbox 空白图", { exact: true }).first()).toBeVisible();
  await expect.poll(() => sharedState.diagrams.some((diagram) => diagram.name === "Sandbox 空白图")).toBe(true);

  await context.close();
});

async function installSharedJsonRoute(
  context: BrowserContext,
  getState: () => BochuPathSharedState,
  setState: (state: BochuPathSharedState) => void,
): Promise<void> {
  await context.route("**/api/link/test/files/bochupath-data.json", async (route: Route) => {
    if (route.request().method() === "PUT") {
      setState(route.request().postDataJSON() as BochuPathSharedState);
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(getState()),
    });
  });
}
