import { expect, test, type Locator, type Page } from "@playwright/test";

test("opens the seed diagram, switches modes and persists an edit", async ({
  page,
}) => {
  await page.goto("/diagrams");
  await expect(page.getByRole("heading", { name: "通路图库" })).toBeVisible();
  await page.getByRole("button", { name: "编辑 需求到交付示例" }).click();
  await expect(page.getByLabel("通路图画布")).toBeVisible();
  await page.getByRole("treeitem", { name: "需求确认" }).click();
  await expect(page.getByRole("heading", { name: "节点属性" })).toBeVisible();
  const name = page.getByLabel("节点名称");
  await name.fill("需求澄清");
  await page.getByRole("button", { name: "确定" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("✓ 已保存")).toBeVisible();
  await page.reload();
  await expect(page.getByText("需求澄清").first()).toBeVisible();
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toHaveCount(0);
});

test("fits the complete TB/LR canvas and renders directed arrows at 1440x900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/diagrams/diagram_demo/edit");
  await expect(page.getByLabel("通路图画布")).toBeVisible();

  await page.getByRole("button", { name: "适应" }).click();
  await expectCanvasInsideStage(page);
  const edgePaths = page.locator(".react-flow__edge-path");
  await expect(edgePaths).toHaveCount(2);
  for (const edge of await edgePaths.all())
    await expect(edge).toHaveAttribute("marker-end", /url\(/);

  await page.getByLabel("放大").click();
  await page.getByLabel("放大").click();
  await page.getByRole("button", { name: "适应" }).click();
  await expectCanvasInsideStage(page);

  await page.getByLabel("方向").selectOption("LR");
  await page.getByRole("button", { name: "确定" }).click();
  await page.getByRole("button", { name: "适应" }).click();
  await expectCanvasInsideStage(page);
  for (const edge of await edgePaths.all())
    await expect(edge).toHaveAttribute("marker-end", /url\(/);
});

test("reorders graph members with the canvas and persists node order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/diagrams/diagram_demo/edit");
  await expect(page.getByLabel("通路图画布")).toBeVisible();

  const demandLayer = page.locator('.react-flow__node-layer[data-id="layer::layer_demand"]');
  const deliveryLayer = page.locator('.react-flow__node-layer[data-id="layer::layer_delivery"]');
  await dragCanvasNode(page, demandLayer, deliveryLayer, "header");
  await expect.poll(async () =>
    (await demandLayer.boundingBox())!.y > (await deliveryLayer.boundingBox())!.y,
  ).toBe(true);

  await page.getByTitle("批量添加层级或节点").click();
  await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
  await page.getByLabel("节点名称列表").fill("需求分析；需求归档");
  await page.getByRole("button", { name: "确定" }).click();

  const demandNode = page.getByRole("button", { name: /需求确认，位于 需求层/ });
  const archiveNode = page.getByRole("button", { name: /需求归档，位于 需求层/ });
  await dragCanvasNode(page, demandNode, archiveNode);
  await expect.poll(async () =>
    (await demandNode.boundingBox())!.x > (await archiveNode.boundingBox())!.x,
  ).toBe(true);

  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("后来新增");
  await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
  await page.getByRole("button", { name: "确定" }).click();
  const laterNode = page.getByRole("button", { name: /后来新增，位于 需求层/ });
  expect((await demandNode.boundingBox())!.x).toBeLessThan((await laterNode.boundingBox())!.x);

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("✓ 已保存")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("通路图画布")).toBeVisible();
  expect((await demandLayer.boundingBox())!.y).toBeGreaterThan((await deliveryLayer.boundingBox())!.y);
  expect((await demandNode.boundingBox())!.x).toBeGreaterThan((await archiveNode.boundingBox())!.x);
  expect((await demandNode.boundingBox())!.x).toBeLessThan((await laterNode.boundingBox())!.x);
});

test("keeps tree, canvas and inspector selection synchronized and undoable", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  const layerTreeItem = page.getByRole("treeitem", { name: /需求层/ });
  await layerTreeItem.press(" ");
  await expect(layerTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "层级属性" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "层级 需求层，叶子泳道" }),
  ).toHaveClass(/selected/);

  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  await expect(
    page.getByRole("treeitem", { name: "方案评审" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "节点属性" })).toBeVisible();

  const name = page.getByLabel("节点名称");
  await name.fill("临时名称");
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("节点名称")).toHaveValue("方案评审");
  await expect(page.getByText("✓ 已保存")).toBeVisible();

  await page.getByLabel("节点名称").fill("方案会审");
  await page.getByRole("button", { name: "确定" }).click();
  await expect(page.getByLabel("撤销")).toBeEnabled();
  await page.getByLabel("撤销").click();
  await expect(page.getByRole("treeitem", { name: "方案评审" })).toBeVisible();
  await expect(page.getByText("✓ 已保存")).toBeVisible();
  await page.getByLabel("重做").click();
  await expect(page.getByRole("treeitem", { name: "方案会审" })).toBeVisible();
});

test("clears pathway selection when clicking the canvas background", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("tab", { name: "通路" }).click();

  const pathwayRow = page.locator(".pathway-row").filter({ hasText: "主通路" });
  await pathwayRow.locator(".row-main").click();
  await expect(page.getByRole("heading", { name: "通路属性" })).toBeVisible();
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(2);

  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole("heading", { name: "图概览" })).toBeVisible();
  await expect(pathwayRow).not.toHaveClass(/selected/);
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(0);
});

test("shows an arrowed draft edge and clears the complete draft with Escape", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("tab", { name: "通路" }).click();
  await page.getByRole("button", { name: /新增通路/ }).click();
  await expect(page.getByRole("heading", { name: "新建通路" })).toBeVisible();
  await expect(page.getByRole("button", { name: "删除通路" })).toHaveCount(0);

  await page.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await expect(
    page.getByRole("button", { name: "完成", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  const draft = page.locator(".draft-edge .react-flow__edge-path");
  await expect(draft).toHaveCount(1);
  await expect(draft).toHaveAttribute("marker-end", /url\(/);
  expect(
    await draft.evaluate(
      (element) => (element as SVGPathElement).style.strokeDasharray,
    ),
  ).not.toBe("");
  await expect(page.getByText(/已选 2 个节点 · 2 层/)).toBeVisible();
  await expect(page.getByRole("button", { name: "完成", exact: true })).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(page.locator(".draft-edge")).toHaveCount(0);
  await expect(page.getByText("✓ 已保存")).toBeVisible();

  await page.getByRole("button", { name: /新建通路/ }).click();
  await page.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByRole("heading", { name: "通路属性" })).toBeVisible();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(3);
  await expect(page.getByLabel("撤销")).toBeEnabled();
});

test("fully connects two nodes in each occupied layer", async ({ page }) => {
  await page.goto("/diagrams/diagram_demo/edit");

  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("需求补充");
  await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
  await page.getByRole("button", { name: "确定" }).click();

  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("交付补充");
  await page.getByLabel("所属叶子层级").selectOption({ label: "交付层" });
  await page.getByRole("button", { name: "确定" }).click();

  await page.getByRole("button", { name: /新建通路/ }).click();
  await page.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await page.getByRole("button", { name: /需求补充，位于 需求层/ }).click();
  await expect(page.locator(".draft-edge")).toHaveCount(0);
  await page.getByRole("button", { name: /交付验收，位于 交付层/ }).click();
  await expect(page.locator(".draft-edge")).toHaveCount(2);
  await page.getByRole("button", { name: /交付补充，位于 交付层/ }).click();
  await expect(page.locator(".draft-edge")).toHaveCount(4);
  await expect(page.getByText("4 个节点 · 2 个占用层 · 4 条边")).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(6);
});

test("highlights every visible pathway node and edge in edit and view modes", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();

  await expect(page.locator(".business-node.related")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(2);
  await expect(page.getByText(/已高亮 1 条可见通路、3 个关联节点/)).toBeVisible();

  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.locator(".business-node.related")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(2);
  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".business-node.related")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(0);
});

test("edits same-layer and cross-layer pathway membership directly on the canvas", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("button", { name: "＋ 层级" }).click();
  await page.getByLabel("层级名称").fill("运营层");
  await page.getByRole("button", { name: "确定" }).click();

  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("运营复盘");
  await page.getByLabel("所属叶子层级").selectOption({ label: "运营层" });
  await page.getByRole("button", { name: "确定" }).click();

  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("需求补充");
  await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
  await page.getByRole("button", { name: "确定" }).click();

  await page.getByRole("tab", { name: "通路" }).click();
  await page.locator(".pathway-row").filter({ hasText: "主通路" }).locator(".row-main").click();
  await expect(page.getByRole("button", { name: "在画布编辑节点" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "通路属性" })).toBeVisible();
  const demandSupplement = page.getByRole("button", { name: /需求补充，位于 需求层/ });
  await demandSupplement.click();
  await expect(page.getByRole("heading", { name: "节点属性" })).toBeVisible();
  await page.locator(".pathway-row").filter({ hasText: "主通路" }).locator(".row-main").click();
  await demandSupplement.click({ modifiers: ["Shift"] });
  await expect(page.getByText("4 个节点 · 3 个占用层 · 3 条边")).toBeVisible();
  await demandSupplement.click({ modifiers: ["Shift"] });
  await expect(page.getByText("3 个节点 · 3 个占用层 · 2 条边")).toBeVisible();
  await demandSupplement.click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: /运营复盘，位于 运营层/ }).click({ modifiers: ["Shift"] });
  await expect(page.getByText("5 个节点 · 4 个占用层 · 4 条边")).toBeVisible();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(4);

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("✓ 已保存")).toBeVisible();
  await page.reload();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(4);
  await page.getByRole("tab", { name: "通路" }).click();
  await page.locator(".pathway-row").filter({ hasText: "主通路" }).locator(".row-main").click();
  await expect(page.getByLabel("通路图结构").getByText(/需求补充/)).toBeVisible();
  await expect(page.getByLabel("通路图结构").getByText(/运营复盘/)).toBeVisible();
});

test("creates and deletes a node through undoable domain commands", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByTitle("新增节点").click();
  await expect(page.getByRole("heading", { name: "新建节点" })).toBeVisible();

  await page.getByLabel("节点名称").fill("待删除测试节点");
  await page.getByRole("button", { name: "确定" }).click();
  await expect(
    page.getByRole("treeitem", { name: "待删除测试节点" }),
  ).toBeVisible();
  await expect(page.getByLabel("撤销")).toBeEnabled();

  await page.getByRole("button", { name: "删除节点" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "删除节点" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "待删除测试节点" }),
  ).toHaveCount(0);
  await page.getByLabel("撤销").click();
  await expect(
    page.getByRole("treeitem", { name: "待删除测试节点" }),
  ).toBeVisible();
});

test("batch adds ordered nodes and undoes them together", async ({ page }) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByTitle("批量添加层级或节点").click();
  await expect(page.getByRole("heading", { name: "批量添加" })).toBeVisible();

  await page
    .getByLabel("节点名称列表")
    .fill("需求提出；需求分析;\n需求归档");
  await expect(page.getByText("将按顺序添加 3 个节点")).toBeVisible();
  await page.getByRole("button", { name: "确定" }).click();

  for (const name of ["需求提出", "需求分析", "需求归档"])
    await expect(page.getByRole("treeitem", { name })).toBeVisible();
  await page.getByLabel("撤销").click();
  for (const name of ["需求提出", "需求分析", "需求归档"])
    await expect(page.getByRole("treeitem", { name })).toHaveCount(0);
});

test("offers and restores a newer local draft after reload", async ({ page }) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("treeitem", { name: "需求确认" }).click();
  await page.getByLabel("节点名称").fill("草稿中的需求确认");
  await page.getByRole("button", { name: "确定" }).click();
  await page.waitForTimeout(650);

  await page.reload();
  await expect(page.getByText("发现比上次保存更新的本地草稿。")).toBeVisible();
  await page.getByRole("button", { name: "恢复草稿" }).click();
  await expect(
    page.getByRole("treeitem", { name: "草稿中的需求确认" }),
  ).toBeVisible();
  await expect(page.getByText("● 有未保存修改")).toBeVisible();
});

async function expectCanvasInsideStage(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  const stage = await page.locator(".flow-wrap").boundingBox();
  expect(stage).not.toBeNull();
  const nodes = page.locator(
    ".react-flow__node-layer, .react-flow__node-business",
  );
  for (const node of await nodes.all()) {
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(stage!.x + 23);
    expect(box!.y).toBeGreaterThanOrEqual(stage!.y + 23);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      stage!.x + stage!.width - 23,
    );
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      stage!.y + stage!.height - 23,
    );
  }
}

async function dragCanvasNode(
  page: Page,
  source: Locator,
  target: Locator,
  grip: "center" | "header" = "center",
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const sourceX = grip === "header" ? sourceBox!.x + sourceBox!.width - 28 : sourceBox!.x + sourceBox!.width / 2;
  const sourceY = grip === "header" ? sourceBox!.y + 22 : sourceBox!.y + sourceBox!.height / 2;
  const targetX = grip === "header" ? targetBox!.x + targetBox!.width - 28 : targetBox!.x + targetBox!.width / 2;
  const targetY = grip === "header" ? targetBox!.y + 22 : targetBox!.y + targetBox!.height / 2;
  const sourceVisual = source.locator(".business-node, .layer-canvas-node");
  const sourceVisualBox = await sourceVisual.boundingBox();
  const wasSelected = await source.evaluate((element) =>
    element.classList.contains("selected"),
  );
  expect(sourceVisualBox).not.toBeNull();
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 3, sourceY + 2, { steps: 2 });
  await expect(source).toHaveClass(/dragging/);
  expect(
    await source.evaluate((element) => element.classList.contains("selected")),
  ).toBe(wasSelected);
  await expect.poll(() =>
    sourceVisual.evaluate((element) => getComputedStyle(element).transform),
  ).toBe("none");
  const liftedVisualBox = await sourceVisual.boundingBox();
  expect(Math.abs(liftedVisualBox!.width - sourceVisualBox!.width)).toBeLessThan(1);
  expect(Math.abs(liftedVisualBox!.height - sourceVisualBox!.height)).toBeLessThan(1);
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await expect(page.locator(".snap-preview")).toHaveCount(0);
  await expect.poll(async () => {
    const shiftedTargetBox = await target.boundingBox();
    return grip === "header"
      ? Math.abs(shiftedTargetBox!.y - targetBox!.y)
      : Math.abs(shiftedTargetBox!.x - targetBox!.x);
  }).toBeGreaterThan(8);
  await page.mouse.up();
}
