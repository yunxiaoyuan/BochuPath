# 业务通路图 Web 工具｜AI Agent 开发实施规格 V1.0（纯文字）

> 来源：[Confluence 页面](https://docs.fscut.com/pages/viewpage.action?pageId=768523575)  
> 页面 ID：768523575  
> Confluence 版本：2

---

> 文档用途：直接交给负责编程的 AI Agent，作为 V1.0 的唯一实施与验收规格。
>
>
> 文档版本：V1.0 ｜ 日期：2026-08-28 ｜ 状态：可进入开发
>
>
> 重要说明：本文不依赖父页面的图片、draw.io、截图或口头上下文。即使开发 Agent 无法读取任何图片，也应能仅凭本文完成产品。

## 0. 给开发 AI Agent 的执行指令

你要交付的是一个可真正操作、保存、重新打开并验收的桌面 Web 工具，不是静态原型、截图复刻或仅能演示的页面。

开始开发前：

1. 先读取代码库结构、根目录及相邻目录的 `AGENTS.md`、README、包管理器、现有路由、设计系统、状态管理、接口层和测试约定；
2. 有现有项目时，沿用其技术栈、目录和组件，保留用户已有修改，不做无关重写；
3. 若代码库为空或没有明确前端技术栈，采用本文“3.2 绿色开发默认方案”；
4. 不允许因为缺少图片而自行简化功能，本文的文字、数据结构、规则、流程和验收条件已经完整；
5. 任何字段、按钮或状态的实现若与本文冲突，以本文为准；现有仓库的工程约定只决定“怎么实现”，不能删减“实现什么”；
6. 先完成领域模型、校验规则和测试，再接画布与 UI；不要先画一个假页面再补数据；
7. 完成后必须运行最窄但充分的单元、组件、端到端和构建检查，并提交一份“实现清单、测试结果、已知差异”；
8. 除非遇到缺少权限、密钥或与业务范围冲突的不可逆决策，不要中途把正常工程选择反问给用户；按本文默认值完成闭环。

## 1. 产品定义与交付目标

一句话定义：

> 面向企业业务规划、方案梳理和评审人员，通过结构化配置快速创建、维护、查询和阅读业务通路图的桌面 Web 工具。

它不是自由绘图软件。用户编辑四类核心对象：**层级、节点、节点样式、通路**；系统根据这些结构化数据自动计算层级容器、节点位置和有向连线。

V1.0 必须形成以下完整闭环：

`新建图 → 建层级 → 建样式 → 建节点 → 建通路 → 自动呈现 → 校验 → 保存 → 关闭/刷新 → 重新打开 → 查看与高亮`

### 1.1 成功标准

- 用户能从空白图完成四类核心对象的增删查改；
- 树、画布、属性面板始终引用同一份事实数据和同一选中对象；
- 保存后刷新或重新打开，数据与画布结果一致；
- 任何删除、迁移、替换都不会制造悬空引用；
- 查看模式不能改变数据；编辑模式支持撤销、重做、未保存提示和草稿恢复；
- 不依赖人工摆放坐标，也能得到稳定、可读、方向明确的通路图。

## 2. V1.0 范围冻结

### 2.1 必须实现（P0）

| 模块 | 必须实现的能力 |
| --- | --- |
| 通路图库 | 新建、打开、重命名、复制、删除、保存、重新打开；至少提供空白图和一份示例图 |
| 层级 | 树形查看、单个/批量新增顶层或子层级、重命名、排序、移动、删除、影响检查；节点只属于叶子层级 |
| 节点 | 单个/批量新增、查看、编辑、复制、删除、搜索、定位；字段见 4.3 |
| 节点样式 | 新增、查看、编辑、复制、删除、默认样式、引用数、删除前替换引用、实时预览 |
| 通路 | 新增、查看、编辑、删除、画布直接增删节点、相邻占用层全连接、显示/隐藏、聚焦高亮 |
| 画布 | 层级容器、节点、方向箭头、自动布局、缩放、平移、适应画布、框选、关联弱化/高亮 |
| 查看模式 | 搜索、筛选、结构定位、节点详情、单节点全部可见关联通路高亮、单通路聚焦、选中多个节点后筛出包含这些节点的通路 |
| 编辑保障 | 规则校验、依赖检查、撤销/重做、脏状态、手动保存、本地草稿、保存失败反馈 |
| 主题与可达性 | BOCHUI Lite 的 Light/Dark、键盘操作、可访问名称、对比度、200% 浏览器缩放可用 |
| 工程质量 | 类型检查、单元测试、组件测试、关键 E2E、生产构建、README、种子数据 |

### 2.2 明确不做（V1.1 候选）

- 不建立独立的 `NodeType`；V1 用语义化 `NodeStyle` 同时承载类别/状态含义和视觉表达；
- 不允许用户任意创建独立 `Edge`；连线只能由通路节点集合和占用层顺序推导；
- 支持同层多节点通过相邻占用层全连接自动形成的分支与汇聚；不支持条件边、选择性连边、环路和同一通路内重复节点；
- 不支持完全自由拖拽坐标、位置锁定和手工折线编辑；
- 不支持多人实时协作、评论、组织权限、审批发布、历史版本差异；
- 不支持模板市场、全局跨图样式库、开放 API；
- 不要求 Excel/JSON 导入、图片/PDF 导出和分享链接；
- 不要求移动端编辑和超大图增量布局。

开发 Agent 不得“顺手”加入这些能力，以免破坏 V1 的模型边界。

## 3. 技术架构

### 3.1 架构原则

1. `Diagram` 文档是唯一事实源；React Flow 节点、React Flow 边、画布坐标都是派生视图；
2. 持久化数据和临时 UI 状态分离：选择、缩放、面板开关、连接草稿不写进 `Diagram`；
3. 所有写操作通过可校验、可撤销的命令进入文档状态，不允许组件直接散改数组；
4. 规则校验独立于 UI，保存前和数据载入后都必须执行；
5. 布局是纯函数：相同 Diagram 与 LayoutConfig 必须得到相同坐标；
6. 持久化通过 Repository 接口隔离；即使首版使用浏览器本地存储，也可无痛替换为 HTTP 后端；
7. 业务层不依赖截图、位图和硬编码主题色。

### 3.2 绿色开发默认方案

如果现有代码库没有明确技术选型，采用：

- React + TypeScript + Vite；
- BOCHUI Lite 组件和 token；若仓库无法访问该包，则按第 8 章的 token 与尺寸建立薄适配层，不引入另一套强风格 UI 库；
- `@xyflow/react` 负责画布的平移、缩放、选择、自定义节点/边和视口控制；
- Zustand（或现有同等 store）负责编辑器状态与命令；
- Zod（或现有同等 schema 工具）负责持久化数据解析与版本校验；
- 自定义、确定性的泳道布局负责层级容器；V1 不引入 Web Worker；若未来选用 `elkjs` 辅助叶子层内节点排布或边路由，它不能成为事实源，也不能替代层级泳道算法；
- Vitest + Testing Library 做单元/组件测试，Playwright 做关键端到端测试；
- 首个可运行版本以 `localStorage` Repository 完成保存闭环；若仓库已有后端，则实现相同 Repository 接口的 HTTP Adapter。

技术选型依据：React Flow 官方支持 TypeScript、自定义节点/边和父子节点/子流程；ELK 是布局算法而非渲染组件，并适合有方向、带端口的节点连线图。参考：[React Flow TypeScript](https://reactflow.dev/learn/advanced-use/typescript)、[React Flow Node](https://reactflow.dev/api-reference/types/node)、[React Flow Custom Nodes](https://reactflow.dev/examples/nodes/custom-node)、[React Flow Sub Flows](https://reactflow.dev/learn/layouting/sub-flows)、[elkjs](https://github.com/kieler/elkjs)。

### 3.3 建议模块边界

目录名可适配现有项目，但职责不得混合：

```text
src/
  app/                 路由、页面外壳、主题、错误边界
  domain/
    types.ts           持久化领域类型
    schema.ts          运行时解析、Schema 版本与迁移
    rules.ts           领域不变量与错误码
    selectors.ts       树、完整路径、引用数、查询等派生数据
  editor/
    store.ts           文档状态、临时 UI 状态、dirty/saving
    commands/          四类对象 CRUD、迁移、替换、通路节点集合命令
    history.ts         undo/redo；只记录已提交领域命令
  layout/
    swimlane-layout.ts 层级容器和节点的确定性布局
    derive-edges.ts    从通路占用层与节点集合生成渲染边
    route-edges.ts     多通路错位和箭头路由
    worker.ts          可选的异步布局工作器
  canvas/
    PathwayCanvas.tsx  画布组装
    nodes/             层级、业务节点等自定义图元
    edges/             已确认边、候选边、聚焦边
  features/
    diagrams/ layers/ nodes/ node-styles/ pathways/ viewer/
  persistence/
    repository.ts      接口
    local-storage.ts   V1 默认实现
    http.ts            有既有后端时实现
  design-system/       BOCHUI 适配层与语义 token（仅在现有项目缺失时）
  test/                factories、seed、test utils
```

### 3.4 路由

```text
/diagrams                 通路图库
/diagrams/:diagramId/edit 编辑工作台
/diagrams/:diagramId/view 查看工作台
```

若现有项目的路由结构不同，可映射到等价路径，但必须保留“图库、编辑、查看”三种产品入口。

## 4. 领域模型与数据契约

### 4.1 TypeScript 参考定义

```text
type DiagramId = string;
type LayerId = string;
type NodeId = string;
type NodeStyleId = string;
type PathwayId = string;

interface Diagram {
  schemaVersion: '1.1';
  id: DiagramId;
  name: string;
  description?: string;
  revision: number;
  layers: Layer[];
  nodes: DiagramNode[];
  nodeStyles: NodeStyle[];
  pathways: Pathway[];
  layout: LayoutConfig;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

interface Layer {
  id: LayerId;
  parentId: LayerId | null;
  name: string;
  description?: string;
  order: number;
}

interface DiagramNode {
  id: NodeId;
  layerId: LayerId;
  styleId: NodeStyleId;
  name: string;
  description?: string;
  decompositionItems: string[];
  order: number;
}

interface NodeStyle {
  id: NodeStyleId;
  name: string;                 // 语义名，例如“已确认”“待评审”
  shape: 'rect' | 'roundedRect' | 'document';
  fillColor: string;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  borderWidth: 1 | 2 | 3;
  borderRadius: number;
  textColor: string;
  icon?: string;                // 图标组件的受控 key，不存图片 URL
  isDefault: boolean;
  isSystem: boolean;
}

interface Pathway {
  id: PathwayId;
  name: string;
  description?: string;
  color: string;
  lineStyle: 'solid' | 'dashed';
  visible: boolean;
  order: number;
  nodeIds: NodeId[];
}

interface LayoutConfig {
  direction: 'TB' | 'LR';
  layerGap: number;
  nodeGap: number;
  nodeWidth: number;
  nodeMinHeight: number;
  fontSize: number;
  descriptionFontSize: number;
}
```

### 4.2 明确不存在的持久化对象

- 没有 `NodeType`；不要添加 `typeId`；
- 没有独立 `Edge` 表；
- 没有持久化的 React Flow `position`、`sourceHandle`、`targetHandle`；
- 没有把 `selectedId`、zoom、pan、当前 Tab、连接草稿写进 Diagram；
- 没有业务含义不明的 `extra: any`。

### 4.3 字段与表单规则

| 对象 | 字段顺序 | 规则 |
| --- | --- | --- |
| Diagram | 名称、说明、方向、层级间距、节点间距、节点字号、拆解字号 | 名称 1–80 字；默认方向 TB |
| Layer | 层级名称、上级层级、顺序、说明 | 名称 1–40 字；同一父层下不重名 |
| Node | 节点名称、所属叶子层级、节点样式、拆解信息、业务备注 | 名称 1–80 字；拆解信息为可增删排序的短文本数组 |
| NodeStyle | 样式名称、形状、填充、边框、文字、图标/标记 | 名称 1–40 字；颜色必须是可解析颜色；至少一个默认样式 |
| Pathway | 通路名称、节点集合、颜色、线型、备注、是否显示 | 名称 1–80 字；节点不重复且至少占用两个不同叶子层级；相邻占用层自动全连接，同层不连边 |

### 4.4 示例数据

开发时至少内置一份相同结构的种子数据，便于首次打开和自动化测试：

呈现代码宏出错: 参数'com.atlassian.confluence.ext.code.render.InvalidValueException'的值无效
```text
{
  "schemaVersion": "1.1",
  "id": "diagram_demo",
  "name": "需求到交付示例",
  "description": "用于验证分层、节点样式和跨层通路",
  "revision": 1,
  "layers": [
    { "id": "layer_demand", "parentId": null, "name": "需求层", "order": 10 },
    { "id": "layer_solution", "parentId": null, "name": "方案层", "order": 20 },
    { "id": "layer_delivery", "parentId": null, "name": "交付层", "order": 30 }
  ],
  "nodes": [
    { "id": "node_demand", "layerId": "layer_demand", "styleId": "style_confirmed", "name": "需求确认", "decompositionItems": ["范围", "目标"], "order": 10 },
    { "id": "node_solution", "layerId": "layer_solution", "styleId": "style_review", "name": "方案评审", "decompositionItems": ["业务方案", "技术方案"], "order": 10 },
    { "id": "node_delivery", "layerId": "layer_delivery", "styleId": "style_confirmed", "name": "交付验收", "decompositionItems": ["验收结论"], "order": 10 }
  ],
  "nodeStyles": [
    { "id": "style_confirmed", "name": "已确认", "shape": "roundedRect", "fillColor": "#EAF7EF", "borderColor": "#2E8B57", "borderStyle": "solid", "borderWidth": 1, "borderRadius": 4, "textColor": "#1F2329", "isDefault": true, "isSystem": true },
    { "id": "style_review", "name": "待评审", "shape": "roundedRect", "fillColor": "#FFF5E6", "borderColor": "#C97A00", "borderStyle": "dashed", "borderWidth": 1, "borderRadius": 4, "textColor": "#1F2329", "isDefault": false, "isSystem": false }
  ],
  "pathways": [
    { "id": "path_main", "name": "主通路", "color": "#2F64F7", "lineStyle": "solid", "visible": true, "order": 10,
      "nodeIds": ["node_demand", "node_solution", "node_delivery"] }
  ],
  "layout": { "direction": "TB", "layerGap": 32, "nodeGap": 24, "nodeWidth": 180, "nodeMinHeight": 64, "fontSize": 14, "descriptionFontSize": 12 },
  "createdAt": "2026-08-28T12:00:00.000Z",
  "updatedAt": "2026-08-28T12:00:00.000Z"
}
```

种子 JSON 可以出现具体业务色；业务组件和界面状态色不能硬编码这些值。

## 5. 领域不变量、删除与迁移规则

所有规则必须在独立领域层实现，并返回稳定错误码。表单提示只是规则结果的展示，不得复制出另一套判断。

### 5.1 通用规则

- 所有 ID 在各自集合内唯一；所有外键必须存在；
- 每次命令完成后，将同级 `order` 归一化为 `10, 20, 30...`；
- 载入数据先按 Schema 解析，再校验引用和不变量；非法文档不得静默渲染；
- 一个复杂操作必须事务化：要么全部成功并进入一条撤销历史，要么完全不改数据。
- 批量新增支持中文分号、英文分号或换行分隔名称；同一批对象共享归属设置并按输入顺序追加，提交前预览和校验，整批只写入一条撤销历史。

### 5.2 层级

- `parentId` 形成无环树；不能把层级移动到自己或后代下面；
- 同一 `parentId` 下层级名不可重复，不同分支可同名；
- 节点只能属于叶子层级；
- 给已有节点的叶子层级新增第一个子层级时，弹出迁移流程：填写新子层级并把原节点全部迁移到一个指定叶子层级；创建层级与迁移节点为同一事务；
- 删除空层级可直接确认；删除包含子层或节点的层级，先显示影响清单，要求将节点迁往合法叶子层级，迁移后再删除整个子树；没有合法目标时阻止删除；
- 层级超过 4 级仅提示可读性风险，不硬性禁止。

### 5.3 节点

- 节点名、叶子层级、样式必填；节点可重名；选择器中显示“节点名 · 完整层级路径”；
- 一个节点只属于一个叶子层级、只引用一个主样式，可参与多条通路；
- 删除未被通路引用的节点：确认后删除；
- 删除被通路引用的节点：先列出受影响通路和删除后的占用层结构；若所有受影响通路删除该节点后仍占用至少两个层级，则允许删除并重新派生全连接边；若任一通路只剩一个占用层，则阻止删除，要求用户先调整或删除该通路。

### 5.4 节点样式

- 系统至少有一个 `isDefault=true` 的系统样式；全图只能有一个默认样式；
- 系统样式不可直接删除，可复制为自定义样式；
- 修改样式后，所有引用节点实时更新；
- 删除未引用的自定义样式可确认后删除；
- 删除被引用的自定义样式必须先选择替代样式，替换全部引用和删除样式为同一事务；
- 样式名表达语义，例如“已确认”“有风险”，不要只写“绿色”“橙色”。

### 5.5 通路

- 一条通路至少占用两个不同叶子层级；同一节点在同一通路中最多出现一次；
- 以层级树中叶子层级的深度优先视觉顺序作为层方向，以节点在所属叶子层级内的 `order,id` 作为确定性序列化顺序；TB/LR 共用这一业务方向；
- 一条通路可包含同一层的多个节点，也可跳过未占用的中间层级；Edge 只从上一占用层指向下一占用层，同层节点之间不连边；
- 相邻占用层之间使用笛卡尔积全连接，可自动形成分支与汇聚；不允许手工只保留其中部分边；
- 多条通路可共享节点和相同节点对；通路是节点集合定义的分层有向图，不是多节点有序序列；
- 删除通路只删除 Pathway，不删除节点；
- 隐藏通路仅影响渲染，不删除数据；
- 节点换层或层级移动后重新计算占用层和边；若结果只剩一个占用层，则拒绝该命令；节点/层级排序只影响布局与确定性序列化，不改变成员关系；
- 新建通路时普通点击未选节点加入，`Shift+点击` 已选节点移除；创建前保存在草稿中，至少占用两层后才能确定或按 Enter 创建；
- 编辑已有通路时，选中通路即成为编辑目标，无需二次入口；`Shift+点击` 立即执行可撤销的增删命令，普通点击节点则退出通路编辑并选中该节点；
- Inspector 按占用层展示节点数、层数和派生边数；不提供步骤编号、插入位置、逐边连接或通路节点拖拽排序。

### 5.6 稳定错误码

至少覆盖：

```text
SCHEMA_VERSION_UNSUPPORTED
REFERENCE_NOT_FOUND
LAYER_CYCLE
LAYER_SIBLING_NAME_DUPLICATE
LAYER_NODE_REQUIRES_LEAF
LAYER_MIGRATION_TARGET_INVALID
NODE_LAYER_NOT_LEAF
NODE_STYLE_NOT_FOUND
NODE_DELETE_BREAKS_PATHWAY
STYLE_DEFAULT_DELETE_FORBIDDEN
STYLE_IN_USE_REPLACEMENT_REQUIRED
PATHWAY_MIN_LAYERS
PATHWAY_DUPLICATE_NODE
PERSISTENCE_CONFLICT
PERSISTENCE_FAILED
```

UI 需要把错误码映射为中文、可执行的提示，并将焦点移动到第一个错误字段或全局 Message Bar。

## 6. 连线派生与自动布局

### 6.1 连线派生

持久化中没有 Edge。渲染边由可见通路的节点成员集合和相邻占用层生成：

```text
function deriveEdges(diagram: Diagram, pathway: Pathway): RenderEdge[] {
  const groups = groupMembersByOccupiedLeafLayer(diagram, pathway.nodeIds);
  return groups.slice(0, -1).flatMap((sourceGroup, index) =>
    sourceGroup.nodes.flatMap(sourceNode =>
      groups[index + 1].nodes.map(targetNode => ({
        id: `${pathway.id}::${sourceNode.id}::${targetNode.id}`,
        pathwayId: pathway.id,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id
      }))
    )
  );
}
```

两条通路共享同一节点对时，不合并数据。渲染时按通路 `order/id` 分配平行偏移，使两条线和颜色均可辨；聚焦某通路时，其余通路降对比但仍保留轮廓。

### 6.2 确定性泳道布局

必须先实现自定义布局，不要把嵌套层级完全交给第三方自动布局：

1. 校验并按 `order,id` 稳定排序层级树；
2. 找出所有叶子层级，并按深度优先的视觉顺序展平；
3. 每个叶子层级生成一个泳道带；父层级容器跨越其全部后代泳道；
4. 节点按 `layerId` 分组，再按 `order,id` 稳定排序；
5. 在泳道中根据 `nodeWidth/nodeMinHeight/nodeGap` 排列节点；节点高度由名称和拆解文本测量，但在同一行对齐；
   - 布局接收实际画布宽高作为派生输入，在 16:9 等宽屏和密集数据下枚举紧凑节点宽度、间距与行列容量；优先保持同层单行，通过缩窄节点和按文字换行增高保证内容可读，只有单行投影缩放低于可读性阈值时才允许自动换行；
   - 自动换行不得修改对象 `order`；用户拖动只改变同级/同层 `order`，不持久化坐标；
6. TB 模式从上到下排列泳道，LR 模式从左到右排列；父层标题区固定，不与节点重叠；
7. 生成节点锚点后再派生并路由连线，优先走正交线，箭头指向下一占用层节点；
8. 计算完整包围盒并支持“适应画布”；
9. 同一输入必须输出相同坐标，新增无关节点不能随机打乱其他层级；
   - 已经通过拖动调整的对象顺序必须由 `order` 保持；新增层级或节点默认追加，不能重置既有顺序；
10. 布局失败时回退到简单网格，不得白屏。

若未来使用 ELK，只允许在叶子泳道范围内辅助排布或提供路由提示。V1 的 PageDrop 静态包不引入 Worker 或 Service Worker，布局保持浏览器主线程内的确定性计算并以第 11.4 节基准约束性能。

## 7. 命令、状态机与一致性

### 7.1 编辑器临时状态

```text
type EditorMode = 'view' | 'edit';
type EditorTool = 'select' | 'marquee' | 'pan' | 'createNode' | 'connectPathway';
type SaveState = 'clean' | 'dirty' | 'saving' | 'saveError';
type Selection =
  | { kind: 'diagram'; id: DiagramId }
  | { kind: 'layer'; id: LayerId }
  | { kind: 'node'; id: NodeId }
  | { kind: 'nodeStyle'; id: NodeStyleId }
  | { kind: 'pathway'; id: PathwayId }
  | null;

interface PathwayDraft {
  name: string;
  nodeIds: NodeId[];
  color: string;
  lineStyle: 'solid' | 'dashed';
  description: string;
  visible: boolean;
}
```

树、画布、属性面板只读取一个 `Selection`；不允许各自维护选中 ID。

### 7.2 必须提供的领域命令

```text
createDiagram / renameDiagram / duplicateDiagram / deleteDiagram
createLayer / createLayersBatch / updateLayer / moveLayer / reorderLayer / deleteLayerWithMigration
createNode / createNodesBatch / updateNode / reorderNode / duplicateNode / deleteNode / replacePathwayNode
createNodeStyle / updateNodeStyle / duplicateNodeStyle / deleteNodeStyleWithReplacement / setDefaultStyle
createPathway / updatePathwayMetadata / addPathwayNode / removePathwayNode / deletePathway / setPathwayVisibility
updateLayoutConfig
```

每个命令流程：`校验前置条件 → 生成 next Diagram → 全量不变量校验 → 原子提交 → 写入一条历史 → dirty=true → 触发布局/渲染`。

表单输入过程只改本地草稿；按“确定”后才成为一条命令。Undo/Redo 只记录已提交领域命令，不记录 hover、selection、zoom、Tab 或输入框每个字符。历史默认最多 100 条；新命令会清空 redo 栈。

### 7.3 模式状态机

```text
查看模式
  └─ 切到编辑 → 编辑/选择

编辑/选择
  ├─ 新建通路 → 编辑/新建通路草稿
  ├─ 选中已有通路 → Shift+点击节点立即增删；普通点击节点退出并选择节点
  ├─ 新增或编辑对象 → 编辑/表单草稿
  └─ 切到查看 → 若有未提交表单，选择“应用修改 / 放弃修改 / 留在编辑”

编辑/新建通路草稿
  ├─ 点击未选节点 → 加入草稿；Shift+点击已选节点 → 移除
  ├─ 每次增删 → 按相邻占用层全连接预览图结构
  ├─ Enter 或确定（占用层≥2）→ 提交一条新建通路命令 → 编辑/选择
  └─ Esc 或取消 → 丢弃草稿 → 编辑/选择
```

查看模式 DOM 中不应存在可执行的新增、删除、保存、拖拽和连接控件；不能只把它们置灰。

## 8. 纯文字 UI 实施规格

### 8.1 1440×900 编辑工作台

```text
┌────────────────────────────── GlobalHeader：高 48 ──────────────────────────────────┐
│ [产品] 业务通路图 / 图名               [查看|编辑]  [撤销][重做] 有修改 [保存][主题][更多] │
├──── ObjectPanel：宽 248 ─────┬──────── CanvasWorkspace：宽 872 ────────┬ Inspector：宽320 ┤
│ 对象                      [+]│ [选择][框选][平移]│[节点][连接]│[布局]│缩放  │ 节点属性         │
│ [结构] [通路] [样式]          ├────────────────────────────────────────┤──────────────────│
│ [搜索对象_______________]     │ ┌──────── 需求层 ───────────────────┐ │ 节点名称*        │
│ ▾ 需求层                  2  │ │ [需求提出] ─────────▶ [需求确认]   │ │ [需求确认______] │
│   ◇ 需求提出                 │ └────────────────────────────────────┘ │ 所属叶子层级*    │
│   ◇ 需求确认                 │ ┌──────── 方案层 ───────────────────┐ │ [需求层_______⌄]│
│ ▾ 方案层                  2  │ │ [方案设计] ─────────▶ [方案评审]   │ │ 节点样式*        │
│   ◇ 方案设计                 │ └────────────────────────────────────┘ │ [■ 已确认_____⌄]│
│   ◇ 方案评审                 │                                        │ 拆解信息         │
│ ▸ 交付层                  1  │                              [- 100% +]│ [+ 添加一项]      │
│                            │                                        │ 业务备注         │
│                            │                                        ├──────────────────│
│                            │                                        │   [取消] [确定]   │
├────────────────────────────┴────────────────────────────────────────┴──────────────────┤
│ 编辑模式 · 已选择 1 个节点             操作反馈 / 校验问题             100% · Light │ 高28
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

精确尺寸：

- GlobalHeader：`x0 y0 w1440 h48`；
- Main：`x0 y48 w1440 h824`；
- 左 ObjectPanel：初始 `w248`，可拖动 `208–360`；
- 中 CanvasWorkspace：`x248 y48 w872 h824`，工具栏高 40，画布从 y88 开始；
- 右 Inspector：初始 `w320`，可拖动 `288–420`，Header 高 40，Footer 高 56；
- StatusBar：`x0 y872 w1440 h28`；
- 页面本身不滚动；对象列表、InspectorBody 各自滚动。

### 8.2 DOM 与焦点顺序

```text
<header aria-label="通路图顶部栏">图名 → 模式 → 撤销/重做 → 保存状态 → 保存 → 主题 → 更多</header>
<main>
  <aside aria-label="对象面板">标题 → 结构/通路/样式 → 搜索筛选 → 树或列表</aside>
  <section aria-label="通路图工作区">工具栏 → 连接指引 → 画布 → 缩放工具</section>
  <aside aria-label="属性面板">属性标题 → 表单或详情 → 固定操作区</aside>
</main>
<footer aria-label="状态栏">模式 → 操作反馈 → 选择与缩放信息</footer>
<div aria-live="polite" aria-atomic="true"></div>
```

Tab 顺序与视觉顺序相同，不使用正数 `tabindex` 改序。提供“跳到画布”“跳到属性”跳转链接。

### 8.3 顶栏

- 左：产品标识、面包屑、图名；图名单行省略，悬停展示完整值；
- 中：`Segmented[查看, 编辑]`，必须清楚显示当前项；
- 右：撤销、重做、保存状态、主按钮“保存”、主题、更多；
- 未保存用橙色图标加“有未保存修改”，不能只用颜色；保存中、成功、失败用文字和图标并通过 aria-live 通知；
- 查看模式隐藏撤销、重做、保存及所有写操作。

### 8.4 左对象面板

三个 Tab 必须清楚显示选中态：

1. **结构**：树行高 32。层级行依次为展开箭头、层级图标、名称、节点数；节点显示在所属叶子层级下。hover/selected 时显示拖拽手柄和更多菜单。顶部提供新增层级、新增节点和批量添加；批量添加在 Inspector 选择对象类型与共享归属，输入分隔名称并预览后一次提交；
2. **通路**：列表行高 36，依次为显隐状态、通路名、节点数、定位、更多；顶部“新增通路”；
3. **样式**：列表行高 36，依次为 20×20 矢量预览、样式名、引用节点数、系统/自定义 Tag、更多；顶部“新增样式”。

搜索支持节点名、层级名、通路名；无结果显示“没有匹配对象”和“清除筛选”；长列表虚拟化。

### 8.5 画布工具栏与画布

工具从左到右：

`选择、框选、平移｜新增节点、新建通路｜自动布局、对齐、分布｜缩小、缩放值、放大、适应画布`

- 编辑/选择模式下，层级可沿泳道主轴拖动调整同级 `order`，节点可在所属叶子泳道内拖动调整同层 `order`；采用手机桌面图标式实时预览，被拖对象浮起，经过目标槽位时相邻对象平滑让位，松手后吸附回确定性布局并进入一条可撤销领域命令；不额外显示吸附框或目标序号，拖拽由 React Flow 单一受控节点状态更新，起拖时不切换全局选中态或缩放节点，避免坐标回写、尺寸跳变和闪烁；
- 提供 `Alt+方向键` 的键盘等价排序。TB 下层级使用上下、节点使用左右；LR 下层级使用左右、节点使用上下；

- 图标按钮 32×32，非直观操作有中文 Tooltip 和快捷键；
- 层级用直角或 4px 圆角泳道容器；节点用轻圆角块；通路用带箭头 path；
- 单选节点显示 2px 品牌描边；取该节点参与的全部可见通路，将这些通路的完整成员节点和派生箭头作为关联并集：关联节点显示不覆盖业务样式的外环，关联箭头保留通路颜色并增粗，其余对象 dimmed；隐藏通路不因选择而显示；
- 选中树项、画布图元或 Inspector 对象时，其他两处在 100ms 内同步定位和高亮；
- V1 不提供节点自由位置拖拽；拖动节点只用于改变同层 `order` 时，落点必须映射为排序命令，而非保存坐标；
- 画布空白处点击清除选择；双击节点打开编辑；滚轮缩放，Space+拖动临时平移。

### 8.6 Inspector 字段与按钮顺序

- 无选择：标题“图概览”，显示图名、层级/节点/通路/样式数量、校验问题和快捷操作；
- Layer：`层级名称* → 上级层级 → 顺序 → 说明`；底部危险区“删除层级”；
- Node：`节点名称* → 所属叶子层级* → 节点样式* → 拆解信息 → 业务备注`；没有“节点类型”字段；父层级在 TreeSelect 中禁用并显示“节点只能放入叶子层级”；
- Pathway：`通路名称* → 按占用层分组的节点摘要 → 节点数/层数/派生边数 → 颜色 → 线型 → 备注 → 是否显示`；选中已有通路即直接进入画布成员编辑，不设置二次入口；Inspector 不放置节点增删或逐边编辑控件；
- NodeStyle：`样式名称* → 形状 → 填充 → 边框 → 文字 → 图标/标记`；系统样式只读，可复制；
- 新建/编辑时 InspectorFooter 固定显示“取消｜确定”；通路草稿同时支持 Enter 确定和 Esc 取消；纯查看详情不显示提交按钮；
- 删除动作不与主按钮并排，放在内容底部危险区，二次确认中写清影响数量和处理方案。
- 创建、重命名、复制、删除及未保存切换统一使用应用内 React 对话框和显式事务；不得依赖 `window.confirm`、`window.prompt` 或原生表单导航，以兼容 PageDrop sandbox iframe。

### 8.7 通路画布编辑

```text
┌─ 工具栏：[新建通路]（创建草稿时品牌色激活）────────────────────────────────┐
│ 新建：点击加入、Shift+点击移除；已有通路：Shift+点击立即增删      │
├───────────────────────────────────────────────────────────────────────┤
│ [层A：节点A 节点B] ═══════▶ [层C：节点C 节点D]                       │
│ 相邻占用层全连接；成员显示勾选标记；新建草稿顶部提供完成和取消       │
└───────────────────────────────────────────────────────────────────────┘
```

- 新建通路时在工具栏下插入 36px 指引条，保持当前视口中心不跳动；
- 新建通路时，普通点击未选节点即加入，`Shift+点击` 已选节点即移除；
- 点击通路列表项或通路边即选中该通路并直接进入成员编辑；不提供“在画布编辑节点”按钮；
- 编辑已有通路时，`Shift+点击` 未选节点立即加入、已选节点立即移除，每次生成一条可撤销命令并保持通路选中；普通点击节点退出通路编辑并选中该节点；
- 点击空白、按 Esc、选择其他对象或切换模式退出已有通路编辑；选择另一通路则直接切换编辑目标；
- 节点加入顺序不作为业务顺序；系统按叶子层级固定顺序分组，相邻占用层使用笛卡尔积全连接，同层不连边且允许跳层；
- 已加入节点显示勾选标记，不显示步骤编号；增删后节点数、层数、派生边和 Inspector 分组摘要实时更新；
- 少于 2 个占用层时新建通路“确定”禁用并显示校验提示；
- Enter 或“确定”提交；Esc 或“取消”清除草稿并回到选择工具；
- 候选边为品牌虚线，已确认边为实线；已有通路的成员增删立即生效，名称、颜色、线型、备注和可见性仍通过 Inspector 的“确定/取消”提交，且属性提交不得覆盖最新成员集合。

### 8.8 查看模式

- 无新增、删除、拖拽、连接、保存和可编辑输入框；只读值使用正常文本，不使用低对比 disabled input；
- 左侧可折叠对象概览，支持节点/通路搜索和样式筛选；
- 点击树项或画布节点后，若为单选，计算它参与的全部可见通路，并高亮这些通路的完整节点和箭头并集；清除选择后恢复；
- 点击节点后右侧打开 320px 只读详情，显示名称、完整层级路径、样式、拆解信息、备注及可见/隐藏通路数量；状态区以文字播报高亮的通路和关联节点数；
- 点击通路后聚焦其完整分层图；Inspector 按占用层展示成员和派生边统计，不显示步骤序号；
- Ctrl/Cmd 多选节点后，列出同时包含所有所选节点的通路；若无结果显示清空选择入口；
- 单通路聚焦优先于节点关联高亮；隐藏通路保持隐藏；
- 关闭详情后画布扩展到右侧空间。

### 8.9 BOCHUI Lite 视觉规范

- 默认 `Light + balance/md`，支持 Dark；4px 间距网格；
- 字体：中文 `Microsoft YaHei UI, Arial, sans-serif`，正文 14/22，紧凑正文 14/18；数字优先 `Lato-VF`；
- Light：页面底 `#EDEEEE`、主面板 `#FFFFFF`、次级层 `#F7F8FA`；
- Dark：页面底 `#020203`、主面板 `#27282F`、次级层 `#2E3138`；
- 上述值只用于定义主题 token；业务组件必须使用 `--color-bg-page`、`--color-bg-base`、`--color-fill-level-1`、`--color-brand-*`、`--color-success-*`、`--color-warning-*`、`--color-error-*`、text/border/shadow token；
- 品牌色只用于 active、hover、selected、focus 和主操作；成功绿表示保存成功，警告橙表示未保存或有影响，错误红表示校验和危险；
- 按钮/输入圆角 4，菜单/浮动工具条 8，Dialog/Drawer 12，层级泳道 4；常驻三栏不用卡片阴影；
- 动效：控件 0.1s、树/菜单 0.2s、抽屉 0.25s、对话框 0.3s；`prefers-reduced-motion` 下取消位移动画；
- 必须覆盖 default、hover、pressed、focus-visible、selected、disabled、loading、error、modified；图元另有 dimmed、creating、read-only。

### 8.10 响应式

- `≥1280×720`：完整三栏，中央最小 640；
- `1100–1279`：左 220、右 300；中央不足 580 时折叠未聚焦侧栏；
- `960–1099`：中央全宽，左右为互斥 Overlay Drawer，宽度 288–420 且不超过视口 38%；
- 最小支持 `960×640`；更小时显示“建议使用至少 960×640”，允许查看但禁用编辑并解释原因；
- 高度不足 720 时，Inspector 头尾固定、内容滚动；浏览器 200% 缩放时提交按钮和状态栏仍可达。

### 8.11 快捷键

| 快捷键 | 行为 |
| --- | --- |
| Space 按住 | 临时平移，释放回原工具 |
| V / H / C | 选择 / 平移 / 新建通路（C 仅编辑） |
| Enter / Esc | 提交当前新建通路或行内重命名 / 取消草稿或退出已有通路编辑 |
| Shift+Space | 键盘聚焦画布节点时，切换其是否属于当前已有通路 |
| Delete/Backspace | 删除所选；输入控件内不拦截；查看模式不生效 |
| Cmd/Ctrl+Z | 撤销 |
| Cmd/Ctrl+Shift+Z；Windows Ctrl+Y | 重做 |
| Cmd/Ctrl+S | 保存并阻止浏览器“保存网页” |
| Cmd/Ctrl+F | 焦点移到对象搜索 |
| 0 / + / - | 适应画布 / 放大 / 缩小 |

### 8.12 无障碍

- IconButton 都有中文可访问名称和 Tooltip；装饰图标 `aria-hidden=true`；
- Tree 使用 `tree/treeitem/group` 语义及 `aria-expanded/selected/level`；拖拽排序提供键盘等价菜单；
- 画布 `role=region aria-label="通路图画布"`；节点/通路可 Tab 聚焦，并提供包含名称、层级和关联数的 `aria-label`；
- 画布之外必须有等价对象树和按占用层分组的通路成员摘要，关键信息不能只存在 SVG；
- 状态不能只靠红绿，配合文字、图标、描边或虚实线；正文对比度不低于 4.5:1，图元边界和焦点不低于 3:1；
- 焦点环 2px 且不被裁切；Dialog/Drawer 管理焦点并在关闭后还原触发点；
- 支持 reduced motion、系统高对比模式和 200% 浏览器缩放。

## 9. 持久化、草稿与接口

### 9.1 Repository 接口

```text
interface DiagramRepository {
  list(): Promise<DiagramSummary[]>;
  get(id: DiagramId): Promise<Diagram>;
  create(input: NewDiagramInput): Promise<Diagram>;
  save(diagram: Diagram, expectedRevision: number): Promise<Diagram>;
  duplicate(id: DiagramId, name: string): Promise<Diagram>;
  delete(id: DiagramId): Promise<void>;
}
```

UI 和 store 不得直接调用 localStorage 或 fetch，只调用 Repository。

### 9.2 浏览器存储兜底与个人草稿

```text
bochupath:v1:index
bochupath:v1:diagram:<diagramId>
bochupath:v1:draft:<diagramId>
```

- index 只存摘要；Diagram 分 key 存储；
- `schemaVersion` 必填；当前为 `1.1`，读取 `1.0` 时通过显式 migration 将 `steps[].nodeId` 提取并按画布固定顺序规范化为 `nodeIds[]`；未知版本和只占用一个层级的旧通路停止迁移并报告，不在组件里临时兼容或猜测修复；
- 每个已提交命令后 500ms 防抖写本地草稿；手动保存写正式文档、递增 revision、清除草稿并设为 clean；
- 打开图时若草稿更新时间晚于正式版本，提示“恢复草稿 / 放弃草稿”，不得自动覆盖；
- localStorage 满、解析失败或写入失败时显示持久 Message Bar，保留内存中的未保存内容。
- 旧版 `pathway:v1:*` 首次读取时复制迁移到 `bochupath:v1:*`，不自动删除旧 key。

### 9.3 共享 JSON 与 PageDrop 异步协作实现

- PageDrop 前端 iframe 使用 `allow-scripts allow-same-origin allow-popups`；React、ES Module、DOM/SVG、React Flow、Pointer/Keyboard 事件、ResizeObserver、Hash 路由及相对路径 JSON 请求均可在该沙箱运行；Vite 只用于本机构建，线上仅运行 `dist/` 静态文件；
- 本机开发与 PageDrop 运行态均使用 `bochupath-data.json` 作为共享正式数据源；本机运行数据位于 Git 忽略的 `.bochupath/`，PageDrop 使用同一外链下的 JSON 文件；禁止把共享正式数据写入 localStorage；
- 图库每次打开及窗口重新聚焦时读取最新共享文件；编辑页加载时读取最新 Diagram；
- 手动保存携带加载时的 Diagram revision。共享版本已变化时返回 `PERSISTENCE_CONFLICT`，保留当前浏览器草稿，由用户刷新后人工合并；
- 草稿继续使用 `bochupath:v1:draft:<diagramId>`，只属于当前浏览器，不共享；
- 沙箱未开放 `allow-forms`、`allow-modals` 或 `allow-downloads`：所有表单必须 `preventDefault` 并由 React 事件提交；确认和错误使用应用内组件；V1 不依赖 Blob 下载；
- 图库返回、编辑/查看模式切换等内部导航使用应用内脏状态拦截；不把 `beforeunload` 原生弹窗作为保障，关闭父页面时依靠 500ms 个人草稿和重新进入后的恢复提示；
- 资源使用相对路径，路由使用 Hash 模式，正式读写通过 PageDrop JSON SDK或同外链相对 `fetch` 且带 `credentials: "include"`；不访问父窗口 DOM，不使用顶层跳转、全屏、Pointer Lock、Worker、Service Worker、下载或跨域接口；
- PageDrop 当前仅提供整文件覆盖写入，不提供原子 compare-and-swap，因此支持多人异步协作，不承诺实时同屏、自动合并或同一瞬间并发写入无冲突；
- 更新 PageDrop 外链代码前必须先读取外链详情并保留线上全部 `.json`，尤其是 `bochupath-data.json`。

### 9.4 有后端时的等价接口

```text
GET    /api/bochupath-diagrams
POST   /api/bochupath-diagrams
GET    /api/bochupath-diagrams/:id
PUT    /api/bochupath-diagrams/:id   Body: Diagram；If-Match/expectedRevision
POST   /api/bochupath-diagrams/:id/duplicate
DELETE /api/bochupath-diagrams/:id
```

- `PUT` 使用 revision 乐观锁；冲突返回 409 和 `PERSISTENCE_CONFLICT`，UI 保留本地版本并提示重新加载或另存副本；
- 400 返回领域错误码和字段路径，404 返回对象不存在，500 不泄漏堆栈；
- 后端同样执行 Schema 与领域规则，不能只信任前端。

## 10. 关键用户流程

### 10.1 从空白到保存

1. 在图库点“新建通路图”，输入名称；系统创建默认样式；
2. 进入编辑工作台，新增至少两个顶层或叶子层级；
3. 在“样式”新增一个语义样式并实时预览；
4. 在“结构”新增节点，选择叶子层级和样式；
5. 点击“新建通路”，点击选择至少占用两个不同层级的节点，填写通路名并确定；
6. 系统自动布局，运行校验；若有问题，问题列表可定位到对象；
7. Ctrl/Cmd+S 保存，顶栏从“有未保存修改”变为“已保存”；
8. 刷新页面或返回图库后重新打开，数据和呈现一致。

### 10.2 删除被引用节点

1. 选中节点并点删除；
2. Dialog 列出受影响通路、原占用层结构和删除后的占用层结构；
3. 若每条通路仍占用至少两个层级，允许确认，系统移除节点并在新的相邻占用层之间重新派生全连接边；
4. 若任一通路会只剩一个占用层，确认按钮禁用，提供“前往通路”“替换此节点”“删除通路”；
5. 完成后整个事务可一次 Undo。

### 10.3 删除被引用样式

1. 显示引用节点数量和列表；
2. 强制选择另一个样式；
3. 一次事务完成全部节点替换和旧样式删除；
4. 画布、列表和引用数立即一致；一次 Undo 全部恢复。

## 11. 测试计划

### 11.1 单元测试

至少覆盖：

- Schema 正常解析、`1.0 → 1.1` 显式迁移、未知版本拒绝、单层旧通路迁移失败和缺失引用拒绝；
- 层级环检测、同级重名、叶子限制、迁移事务；
- 默认样式保护、引用替换；
- 嵌套叶子层级深度优先顺序，TB/LR 业务顺序一致；
- 通路至少占用两层、重复节点拒绝、跳层和同层多节点通过、节点集合按画布固定顺序确定性序列化；
- 相邻占用层笛卡尔积、同层不连边、移除中间占用层后前后层自动连接，以及 TB/LR 业务方向一致；
- 节点关联上下文包含全部可见通路的完整成员并集，同时排除隐藏通路；
- 删除或换层后的重新派生，以及只剩一个占用层时阻止；
- `deriveEdges` 的方向、确定性 ID、派生边数和多通路平行偏移；
- 布局确定性、父容器包围盒、TB/LR、空图和失败回退；
- 每个核心命令的 do/undo/redo，redo 栈清理和历史上限；
- 草稿恢复、revision 冲突和存储失败。

### 11.2 组件与可访问性测试

- 查看模式没有写操作 DOM；编辑模式有正确按钮和快捷键；
- 三个 Tab 和“查看/编辑”有明确 selected 状态；
- 树、画布、Inspector 选择在 100ms 内一致；
- 父层在节点 TreeSelect 中不可选且说明原因；
- 表单错误就地显示并关联 `aria-describedby`；
- 新建通路普通点击加入、Shift+点击移除，Enter/确定只提交新建草稿；选中已有通路后无需二次按钮即可 Shift+点击立即切换成员，普通点击节点退出通路编辑，Esc/空白/其他选择也能退出；
- 单选节点在编辑/查看模式高亮全部可见关联通路的完整节点与箭头，隐藏通路排除，单通路聚焦优先；
- 保存状态同时在顶栏/状态栏以颜色加文字表达；
- Dialog/Drawer 焦点陷阱、关闭还焦、IconButton 可访问名称；
- Axe 或同类扫描无 critical/serious 问题。

### 11.3 关键 E2E

1. 新建空白图，完成层级、样式、3 个节点、1 条通路，保存、刷新、重开，数据一致；
2. 选中已有通路后无需按钮即可 Shift+点击连续增删跨层或同层节点，普通点击节点退出；每次即时命令的 Undo/Redo 正确，属性表单提交不覆盖成员；
3. 两个相邻占用层各含两个节点时生成四条边；删除中间占用层后前后层自动全连接，删除会导致单层通路时被阻止；
4. 删除被引用样式前强制选择替代样式；
5. 编辑及查看模式单选节点时完整关联节点/箭头高亮；隐藏通路排除；通路聚焦和多选组合查询优先级正确；
6. Light/Dark 切换，主题 token 生效；
7. 1440×900 无页面级滚动，960×640 仍可查看，200% 缩放时提交按钮可达；
8. 刷新前有草稿时能选择恢复或放弃；模拟保存失败时数据不丢失；
9. 在 `allow-scripts allow-same-origin allow-popups` 的 PageDrop 等价 sandbox iframe 内覆盖跨层/同层通路、画布直接编辑、关联高亮、保存重开、版本冲突、应用内 Dialog、键盘、缩放和 200% 浏览器缩放，控制台无 sandbox、表单提交、资源路径、Cookie 或 JSON 写入错误。

### 11.4 性能基线

- 基准数据：500 个节点、100 条通路、每条平均 8 个成员节点；
- 首次布局和渲染目标在常见办公电脑上 2 秒内给出可操作结果；布局期间显示进度，不白屏；
- 搜索、选择联动、单通路高亮在 100ms 内反馈；
- 超过 200 节点时可把布局移入 Worker；对象面板长列表使用虚拟化；
- 本项是 V1 性能基线，不等于承诺超大图编辑。

## 12. 实施顺序

严格按以下顺序推进，避免返工：

1. 读取仓库约定并记录技术决策；
2. 建立领域类型、Schema、错误码、种子数据和单元测试；
3. 实现 selectors、引用检查和四类对象命令；
4. 实现 undo/redo、dirty/save 状态和 Repository；
5. 实现连线派生与确定性泳道布局，并用纯函数测试固定结果；
6. 搭建图库和三栏工作台外壳；
7. 实现结构树、通路列表、样式列表和 Inspector CRUD；
8. 接入画布、自定义图元、缩放平移和选中联动；
9. 实现新建通路状态机、已有通路直接编辑、候选边和分层图派生；
10. 实现查看模式的搜索、定位、聚焦和组合查询；
11. 完成 Light/Dark、响应式、键盘和无障碍；
12. 完成 E2E、构建、README 和最终自检。

## 13. Definition of Done

只有以下全部满足，才算开发完成：

- 图库和 `/edit`、`/view` 入口可运行；
- 层级、节点、节点样式、通路四类对象 CRUD 全部可操作；
- V1 代码和数据中没有 `NodeType/typeId`，没有持久化独立 Edge；
- 节点只属于叶子层级，层级环和同级重名被阻止；
- 默认样式、样式替换、节点删除对通路的影响规则完整；
- 通路至少占用两个层级、无重复节点，允许同层多节点和跳层；相邻占用层始终全连接，同层不连边；
- 自动布局稳定，相同输入得到相同坐标；失败时不白屏；
- 树、画布、Inspector 使用唯一 Selection 并保持同步；
- 查看模式没有能改变数据的控件、快捷键或拖拽行为；
- 新建模式支持画布点击加入、Shift+点击移除、Enter/Esc 和草稿/已确认视觉区分；选中已有通路即可 Shift+点击即时增删，普通点击节点或 Esc 退出；
- 编辑/查看模式单选节点可高亮其全部可见通路涉及的完整节点与箭头，隐藏通路不显示；
- Undo/Redo 覆盖四类对象核心操作和复杂迁移/替换事务；
- 手动保存、本地草稿、刷新恢复、失败提示和 revision 逻辑可用；
- BOCHUI Light/Dark、尺寸、状态和响应式符合第 8 章；
- 不依赖图片表达任何关键结构、操作或状态；
- 键盘可完成选择、编辑、创建通路和保存；Axe 无 critical/serious；
- PageDrop 等价 sandbox 回归通过，应用不依赖原生表单导航、浏览器模态框、下载、父窗口控制或运行时 Node 服务；
- 1440×900 无页面级滚动，960×640 可查看，200% 缩放可提交；
- 单元、组件、E2E、类型检查和生产构建全部通过；
- README 包含安装、启动、测试、构建、数据模型、存储方式和已知限制；
- 提供示例数据，可在 2 分钟内完成一次完整人工验收；
- 最终报告列出实现文件、测试命令及结果、与本文的任何差异。

## 14. 开发 Agent 最终回复格式

开发完成后，按以下结构回复，便于后续产品审核：

```text
1. 交付结果：可访问地址 / 启动方式
2. 已实现：按 层级、节点、样式、通路、画布、查看、保存 分组
3. 关键架构：事实源、命令、布局、持久化分别如何实现
4. 验证结果：类型检查、单元、组件、E2E、构建的命令和通过数量
5. 人工验收路径：从空白到保存重开的最短步骤
6. 已知差异：逐条引用本文章节；没有则写“无”
7. 审核入口：主要页面 URL、示例图 ID、测试账号（如需要）
```

不要只回复“已完成”，不要省略测试失败或把未实现功能描述为“后续可扩展”。
