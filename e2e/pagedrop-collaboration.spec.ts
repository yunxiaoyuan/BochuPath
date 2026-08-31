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
    `<iframe title="PageDrop app" sandbox="allow-scripts allow-same-origin allow-popups" style="width:1400px;height:800px" src="${baseURL}/api/link/test/files/index.html#/diagrams/diagram_demo/edit"></iframe>`,
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

  await app.getByRole("treeitem", { name: "回归测试节点" }).click();
  await app.getByRole("button", { name: "删除节点" }).click();
  const confirmation = app.getByRole("alertdialog", { name: "删除节点" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await expect(app.getByRole("treeitem", { name: "回归测试节点" })).toHaveCount(0);

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
    `<iframe title="PageDrop gallery" sandbox="allow-scripts allow-same-origin allow-popups" style="width:1400px;height:800px" src="${baseURL}/api/link/test/files/index.html#/diagrams"></iframe>`,
  );
  const app = page.frameLocator('iframe[title="PageDrop gallery"]');

  await app.getByRole("button", { name: "重命名", exact: true }).click();
  const renameDialog = app.getByRole("dialog", { name: "重命名通路图" });
  await renameDialog.getByLabel("新名称").fill("Sandbox 示例图");
  await renameDialog.getByRole("button", { name: "重命名", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Sandbox 示例图" })).toBeVisible();

  await app.getByRole("button", { name: "复制", exact: true }).click();
  const duplicateDialog = app.getByRole("dialog", { name: "复制通路图" });
  await duplicateDialog.getByLabel("副本名称").fill("Sandbox 副本");
  await duplicateDialog.getByRole("button", { name: "复制", exact: true }).click();
  const duplicateCard = app.getByRole("article").filter({ hasText: "Sandbox 副本" });
  await expect(duplicateCard).toBeVisible();

  await duplicateCard.getByRole("button", { name: "删除", exact: true }).click();
  const deleteDialog = app.getByRole("alertdialog", { name: "删除通路图" });
  await deleteDialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(duplicateCard).toHaveCount(0);

  await app.getByRole("button", { name: /从空白图开始/ }).click();
  await app.getByLabel("通路图名称").fill("Sandbox 空白图");
  await app.getByRole("button", { name: "创建", exact: true }).click();

  await expect(app.getByLabel("通路图画布")).toBeVisible();
  await expect(app.getByText("Sandbox 空白图", { exact: true }).first()).toBeVisible();
  await expect.poll(() => sharedState.diagrams.some((diagram) => diagram.name === "Sandbox 空白图")).toBe(true);

  await context.close();
});

test("PageDrop sandbox edits downward pathways and highlights complete node context", async ({
  browser,
  baseURL,
}) => {
  const diagram = createDemoDiagram();
  diagram.layers.push({ id: "layer_operation", parentId: null, name: "运营层", order: 40 });
  diagram.nodes.push({
    id: "node_operation",
    layerId: "layer_operation",
    styleId: "style_confirmed",
    name: "运营复盘",
    decompositionItems: [],
    order: 10,
  });
  diagram.nodes.push({
    id: "node_demand_alt",
    layerId: "layer_demand",
    styleId: "style_confirmed",
    name: "需求补充",
    decompositionItems: [],
    order: 20,
  });
  let sharedState: BochuPathSharedState = {
    schemaVersion: "1.0",
    revision: 1,
    updatedAt: "2026-08-31T00:00:00.000Z",
    lastMutationId: "seed_pathway",
    diagrams: [diagram],
  };
  const context = await browser.newContext();
  await installSharedJsonRoute(context, () => sharedState, (next) => { sharedState = next; });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setContent(
    `<iframe title="PageDrop pathways" sandbox="allow-scripts allow-same-origin allow-popups" style="width:1400px;height:800px" src="${baseURL}/api/link/test/files/index.html#/diagrams/diagram_demo/edit"></iframe>`,
  );
  const app = page.frameLocator('iframe[title="PageDrop pathways"]');

  const demand = app.locator('.react-flow__node-business[data-id="node_demand"]');
  const demandAlt = app.locator('.react-flow__node-business[data-id="node_demand_alt"]');
  const demandBox = await demand.boundingBox();
  const demandAltBox = await demandAlt.boundingBox();
  expect(demandBox).not.toBeNull();
  expect(demandAltBox).not.toBeNull();
  await page.mouse.move(
    demandAltBox!.x + demandAltBox!.width / 2,
    demandAltBox!.y + demandAltBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(demandAltBox!.x + demandAltBox!.width / 2 + 4, demandAltBox!.y + demandAltBox!.height / 2, { steps: 2 });
  await page.mouse.move(demandBox!.x + demandBox!.width / 2, demandBox!.y + demandBox!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () =>
    (await demandAlt.boundingBox())!.x < (await demand.boundingBox())!.x,
  ).toBe(true);

  await app.getByRole("button", { name: /连接/ }).click();
  await app.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await expect(app.getByText("已选 1 个")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(app.getByRole("heading", { name: "新建通路" })).toHaveCount(0);
  await app.getByRole("button", { name: "放大" }).click();
  await app.getByRole("button", { name: "缩小" }).click();

  await app.getByRole("tab", { name: "通路" }).click();
  await app.locator(".pathway-row").filter({ hasText: "主通路" }).locator(".row-main").click();
  await app.getByRole("button", { name: /添加下游节点/ }).click();
  await expect(app.locator(".business-node.candidate")).toHaveCount(1);
  await expect(app.locator('.react-flow__node-business[data-id="node_demand_alt"] .business-node')).toHaveClass(/dimmed/);
  await app.locator("html").evaluate((element) => { element.style.zoom = "2"; });
  await expect(app.getByRole("region", { name: "合法候选节点" })).toBeVisible();
  await app.getByRole("button", { name: /运营复盘，位于 运营层/ }).click();
  await app.getByRole("button", { name: "确定" }).press("Enter");
  await app.locator("html").evaluate((element) => { element.style.zoom = ""; });

  await expect(app.getByText("● 有未保存修改")).toBeVisible();
  await app.getByLabel("返回通路图库").click();
  const leaveDialog = app.getByRole("dialog", { name: "返回通路图库" });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "取消" }).click();
  await app.getByRole("button", { name: "保存", exact: true }).click();
  await expect(app.getByText("✓ 已保存")).toBeVisible();
  expect(sharedState.diagrams[0]?.pathways[0]?.steps.map((step) => step.nodeId)).toEqual([
    "node_demand", "node_solution", "node_delivery", "node_operation",
  ]);

  await app.getByRole("button", { name: "查看", exact: true }).click();
  await app.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  await expect(app.locator(".business-node.related")).toHaveCount(3);
  await expect(app.locator(".react-flow__edge.related-edge")).toHaveCount(3);
  expect(consoleErrors).toEqual([]);
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
