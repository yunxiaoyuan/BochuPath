import { expect, test, type Page } from "@playwright/test";

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
    page.getByRole("button", { name: "完成通路", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  const draft = page.locator(".draft-edge .react-flow__edge-path");
  await expect(draft).toHaveCount(1);
  await expect(draft).toHaveAttribute("marker-end", /url\(/);
  expect(
    await draft.evaluate(
      (element) => (element as SVGPathElement).style.strokeDasharray,
    ),
  ).not.toBe("");
  await expect(page.getByText("已选 2 个")).toBeVisible();
  await expectPathwayFinishNearLastNode(page, "node_solution");

  await page.keyboard.press("Escape");
  await expect(page.locator(".draft-edge")).toHaveCount(0);
  await expect(page.getByText("✓ 已保存")).toBeVisible();

  await page.getByRole("button", { name: /连接/ }).click();
  await page.getByRole("button", { name: /需求确认，位于 需求层/ }).click();
  await page.getByRole("button", { name: /方案评审，位于 方案层/ }).click();
  await page
    .getByRole("button", { name: "完成通路", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "通路属性" })).toBeVisible();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(3);
  await expect(page.getByLabel("撤销")).toBeEnabled();
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

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除节点" }).click();
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

async function expectPathwayFinishNearLastNode(
  page: Page,
  lastNodeId: string,
): Promise<void> {
  const toolbar = page.locator(".pathway-finish-toolbar");
  const action = page.getByRole("button", { name: "完成通路", exact: true });
  await expect(toolbar).toBeVisible();
  await expect(action).toBeVisible();
  await expect(toolbar).toHaveAttribute(
    "data-placement",
    /bottom|right|left|top/,
  );

  const actionBox = await action.boundingBox();
  const lastNodeBox = await page
    .locator(`.react-flow__node-business[data-id="${lastNodeId}"]`)
    .boundingBox();
  expect(actionBox).not.toBeNull();
  expect(lastNodeBox).not.toBeNull();
  expect(rectangleGap(actionBox!, lastNodeBox!)).toBeLessThanOrEqual(14);

  const otherNodes = page.locator(
    `.react-flow__node-business:not([data-id="${lastNodeId}"])`,
  );
  for (const node of await otherNodes.all()) {
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    expect(overlaps(actionBox!, box!)).toBe(false);
  }
}

function rectangleGap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): number {
  const horizontal = Math.max(
    0,
    right.x - (left.x + left.width),
    left.x - (right.x + right.width),
  );
  const vertical = Math.max(
    0,
    right.y - (left.y + left.height),
    left.y - (right.y + right.height),
  );
  return Math.hypot(horizontal, vertical);
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}
