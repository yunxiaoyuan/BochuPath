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

test("view mode dedicates the workspace to the canvas and exits fullscreen with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/diagrams/diagram_demo/view");
  const canvas = page.getByLabel("通路图画布");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("complementary", { name: "对象面板" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "属性面板" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "画布全屏" })).toBeVisible();
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(1400);

  await page.getByRole("button", { name: "画布全屏" }).click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/canvas-fullscreen-mode/);
  await expect(page.getByRole("banner", { name: "通路图顶部栏" })).toBeHidden();
  await expect(page.getByRole("button", { name: "退出全屏" })).toBeVisible();
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(820);

  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-shell")).not.toHaveClass(/canvas-fullscreen-mode/);
  await expect(page.getByRole("banner", { name: "通路图顶部栏" })).toBeVisible();
  await expect(page.getByRole("button", { name: "画布全屏" })).toBeVisible();
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
  for (const edge of await edgePaths.all()) {
    await expect(edge).toHaveAttribute("marker-end", /url\(/);
    await expect(edge).toHaveAttribute("d", /C/);
    await expectEdgeMarkerSize(edge, 8);
  }

  await page.getByLabel("放大").click();
  await page.getByLabel("放大").click();
  await page.getByRole("button", { name: "适应" }).click();
  await expectCanvasInsideStage(page);

  await page.getByLabel("方向").selectOption("LR");
  await page.getByRole("button", { name: "确定" }).click();
  await page.getByRole("button", { name: "适应" }).click();
  await expectCanvasInsideStage(page);
  for (const edge of await edgePaths.all()) {
    await expect(edge).toHaveAttribute("marker-end", /url\(/);
    await expect(edge).toHaveAttribute("d", /C/);
    await expectEdgeMarkerSize(edge, 8);
  }
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

test("keeps the active pathway visible until Escape exits editing", async ({
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
  await expect(pathwayRow).toHaveClass(/active-pathway/);
  await expect(page.locator(".active-pathway-bar").getByText(/正在编辑通路：主通路/)).toBeVisible();
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(pathwayRow).not.toHaveClass(/active-pathway/);
  await expect(page.locator(".active-pathway-bar")).toHaveCount(0);
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
  await expectEdgeMarkerSize(draft, 8);
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

test("renders all node shapes without clipping labels and supports dash-dot pathways", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByRole("tab", { name: "样式" }).click();

  const shapes = [
    { label: "文档", name: "文档样式", tag: "path" },
    { label: "椭圆", name: "椭圆样式", tag: "ellipse" },
    { label: "腰圆", name: "腰圆样式", tag: "rect" },
    { label: "圆柱", name: "圆柱样式", tag: "path" },
    { label: "便签", name: "便签样式", tag: "path" },
  ];
  for (const shape of shapes) {
    await page.getByRole("button", { name: /新增样式/ }).click();
    await page.getByLabel("样式名称").fill(shape.name);
    await page.getByLabel("形状").selectOption({ label: shape.label });
    await page.getByRole("button", { name: "确定", exact: true }).click();
  }

  await page.getByRole("tab", { name: "结构" }).click();
  for (const [index, shape] of shapes.entries()) {
    const nodeName = `CypNest多语言节点${index + 1}`;
    await page.getByTitle("新增节点").click();
    await page.getByLabel("节点名称").fill(nodeName);
    await page.getByLabel("节点样式").selectOption({ label: shape.name });
    await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
    await page.getByRole("button", { name: "确定", exact: true }).click();

    const node = page.getByRole("button", { name: new RegExp(`${nodeName}，位于 需求层`) });
    const surface = node.locator(".node-shape-surface");
    await expect(surface).toHaveCount(1);
    expect(await surface.evaluate((element) => element.tagName.toLocaleLowerCase())).toBe(shape.tag);
    await expect.poll(() => node.locator(".business-node-content > strong").evaluate((element) => ({
      horizontal: element.scrollWidth <= element.clientWidth + 1,
      vertical: element.scrollHeight <= element.clientHeight + 1,
    }))).toEqual({ horizontal: true, vertical: true });
  }

  await page.getByRole("tab", { name: "通路" }).click();
  await page.locator(".pathway-row").filter({ hasText: "主通路" }).locator(".row-main").click();
  await page.getByLabel("线型").selectOption("dashDot");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect.poll(() => page.locator(".react-flow__edge-path").first().evaluate(
    (element) => (element as SVGPathElement).style.strokeDasharray,
  )).toBe("8, 4, 1, 4");
});

test("highlights complete node context without changing unrelated nodes", async ({
  page,
}) => {
  await page.goto("/diagrams/diagram_demo/edit");
  await page.getByTitle("新增节点").click();
  await page.getByLabel("节点名称").fill("未关联节点");
  await page.getByLabel("所属叶子层级").selectOption({ label: "需求层" });
  await page.getByRole("button", { name: "确定" }).click();
  const unrelatedNode = page.getByRole("button", { name: /未关联节点，位于 需求层/ });
  const unrelatedBusinessNode = unrelatedNode.locator(".business-node");
  const unrelatedNodeSurface = unrelatedBusinessNode.locator(".node-shape-surface");

  await page.getByRole("button", { name: /新建通路/ }).click();
  await unrelatedNode.click();
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(3);

  const paneBox = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.click(paneBox!.x + paneBox!.width - 8, paneBox!.y + paneBox!.height - 8);
  await expect(unrelatedBusinessNode).not.toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const unrelatedEdge = page
    .getByRole("button", { name: /新通路.*：未关联节点 到 方案评审/ })
    .locator(".react-flow__edge-path");
  const unrelatedLayer = page.locator(
    '.react-flow__node-layer[data-id="layer::layer_demand"] .layer-canvas-node',
  );
  const unrelatedNodeStyleBefore = await visualStyle(unrelatedNodeSurface);
  const unrelatedEdgeStyleBefore = await visualStyle(unrelatedEdge);
  const unrelatedLayerStyleBefore = await visualStyle(unrelatedLayer);
  const reviewNode = page
    .getByRole("button", { name: /方案评审，位于 方案层/ })
    .locator(".business-node");
  const reviewSurface = reviewNode.locator(".node-shape-surface");
  const selectedNode = page
    .getByRole("button", { name: /需求确认，位于 需求层/ })
    .locator(".business-node");
  const selectedSurface = selectedNode.locator(".node-shape-surface");
  await selectedNode.click();

  const relatedNodes = page.locator(".business-node.related");
  await expect(relatedNodes).toHaveCount(2);
  await expect(selectedNode).toHaveClass(/selected/);
  await expect(selectedSurface).toHaveCSS("fill", "rgb(47, 100, 247)");
  await expect(selectedNode).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(reviewNode).toHaveClass(/related/);
  await expect(reviewSurface).toHaveCSS("stroke-width", "2px");
  expect(await reviewNode.locator(".node-shape-graphic").evaluate((element) =>
    getComputedStyle(element).filter,
  )).not.toBe("none");
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(2);
  await expect(unrelatedBusinessNode).not.toHaveClass(/dimmed/);
  await expect(unrelatedEdge.locator("xpath=..")).not.toHaveClass(/dimmed-edge/);
  await expect.poll(() => visualStyle(unrelatedNodeSurface)).toEqual(unrelatedNodeStyleBefore);
  await expect.poll(() => visualStyle(unrelatedEdge)).toEqual(unrelatedEdgeStyleBefore);
  await expect.poll(() => visualStyle(unrelatedLayer)).toEqual(unrelatedLayerStyleBefore);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("✓ 已保存")).toBeVisible();

  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.locator(".business-node.related")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(2);
  await expect(unrelatedBusinessNode).not.toHaveClass(/dimmed/);
  await expect.poll(() => visualStyle(unrelatedNodeSurface)).toEqual(unrelatedNodeStyleBefore);
  await expect.poll(() => visualStyle(unrelatedEdge)).toEqual(unrelatedEdgeStyleBefore);
  await expect.poll(() => visualStyle(unrelatedLayer)).toEqual(unrelatedLayerStyleBefore);
  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".business-node.related")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge.related-edge")).toHaveCount(0);
  await expect(unrelatedBusinessNode).not.toHaveClass(/dimmed/);
  await expect(reviewSurface).toHaveCSS("stroke-width", "1px");
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
  await expect(page.locator(".active-pathway-bar").getByText(/正在编辑通路：主通路/)).toBeVisible();
  const demandSupplement = page.getByRole("button", { name: /需求补充，位于 需求层/ });
  await demandSupplement.click();
  await expect(page.getByRole("heading", { name: "节点属性" })).toBeVisible();
  await expect(page.locator(".pathway-row").filter({ hasText: "主通路" })).toHaveClass(/active-pathway/);
  await demandSupplement.click({ modifiers: ["Shift"] });
  await expect(page.locator(".active-pathway-bar")).toContainText("4 节点 · 3 边");
  await demandSupplement.click({ modifiers: ["Shift"] });
  await expect(page.locator(".active-pathway-bar")).toContainText("3 节点 · 2 边");
  await demandSupplement.click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: /运营复盘，位于 运营层/ }).click({ modifiers: ["Shift"] });
  await expect(page.locator(".active-pathway-bar")).toContainText("5 节点 · 4 边");
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
  const safeInset = 11; // 12px adaptive padding with 1px rendering tolerance.
  const nodes = page.locator(
    ".react-flow__node-layer, .react-flow__node-business",
  );
  await expect.poll(async () => {
    const stage = await page.locator(".flow-wrap").boundingBox();
    if (!stage) return false;
    const boxes = await Promise.all((await nodes.all()).map((node) => node.boundingBox()));
    return boxes.every((box) => box &&
      box.x >= stage.x + safeInset &&
      box.y >= stage.y + safeInset &&
      box.x + box.width <= stage.x + stage.width - safeInset &&
      box.y + box.height <= stage.y + stage.height - safeInset);
  }).toBe(true);
}

async function expectEdgeMarkerSize(edge: Locator, size: number): Promise<void> {
  await expect.poll(() => edge.evaluate((element) => {
    const reference = element.getAttribute("marker-end") ?? "";
    const markerId = reference
      .replace(/^url\(['"]?#/, "")
      .replace(/['"]?\)$/, "");
    const marker = markerId ? element.ownerDocument.getElementById(markerId) : null;
    return {
      height: marker?.getAttribute("markerHeight") ?? null,
      width: marker?.getAttribute("markerWidth") ?? null,
    };
  })).toEqual({ height: String(size), width: String(size) });
}

async function visualStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      filter: style.filter,
      fill: style.fill,
      opacity: style.opacity,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    };
  });
}

async function dragCanvasNode(
  page: Page,
  source: Locator,
  target: Locator,
  grip: "center" | "header" = "center",
): Promise<void> {
  const sourceId = await source.getAttribute("data-id");
  await expect.poll(async () => {
    const box = await source.boundingBox();
    if (!box) return null;
    const x = grip === "header" ? box.x + box.width - 28 : box.x + box.width / 2;
    const y = grip === "header" ? box.y + 22 : box.y + box.height / 2;
    return page.evaluate(({ x, y }) =>
      document.elementFromPoint(x, y)?.closest(".react-flow__node")?.getAttribute("data-id") ?? null,
    { x, y });
  }).toBe(sourceId);
  await Promise.all([source, target].map((locator) => locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) =>
      animation.finished.catch(() => undefined),
    ));
  })));
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
  const nudgeX = grip === "header" ? 0 : targetX >= sourceX ? 12 : -12;
  const nudgeY = grip === "header" ? targetY >= sourceY ? 12 : -12 : 0;
  await page.mouse.move(sourceX + nudgeX, sourceY + nudgeY, { steps: 2 });
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
