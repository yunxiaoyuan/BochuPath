# 业务作图web工具

> 来源：[Confluence 页面](https://docs.fscut.com/pages/viewpage.action?pageId=768523529)  
> 页面 ID：768523529  
> Confluence 版本：12

---

# 业务通路图 Web 工具：竞品分析与产品设计 V1.0

> 文档版本：V1.0 ｜ 日期：2026-08-28 ｜ 状态：产品方案初稿

## 0. 执行摘要

Layer 通路图不是自由绘图软件，而是一套**结构化业务通路图编辑器**：用户配置层级、节点、节点样式和通路，系统负责把结构化数据转换成分层画布与关系连线。

本方案建议复用这一问题抽象，但不复刻竞品的具体界面和不足。自研 V1.0 的核心是：

- 用层级定义业务空间；
- 用节点承载业务对象、活动、系统或成果；
- 用节点样式表达稳定的业务语义；
- 用有序通路表达端到端关系；
- 由统一画布自动布局、渲染、查询和高亮；
- 采用 BOCHUI Lite 的桌面专业工具风格，形成更清晰的查看/编辑分态和更稳定的建模闭环。

一句话产品定义：

> 面向企业业务规划与方案梳理人员，通过结构化配置快速创建、维护和阅读业务通路图的桌面 Web 工具。

## 1. 研究方法与边界

本次以 `https://layer.fsdev.cn/#/pathway?id=37` 为竞品样本，采用只读方式观察界面、配置入口、对象关系和最终画布。未对目标图执行新增、编辑、删除、拖拽或云端保存。

全文使用三类证据标签：

- **【竞品已确认】**：在目标页面中直接观察到的能力。
- **【合理推断】**：由界面和对象关系推导出的产品意图，不作为竞品事实下结论。
- **【自研方案】**：V1.0 独立设计，不照搬竞品细节。

研究重点是推断竞品实现了哪些工具功能，不深挖其异常状态、边界处理或交互缺陷；这些细节由 V1.0 按业务逻辑重新设计。

## 2. 竞品分析

### 2.1 产品定位

【合理推断】Layer 的核心价值不是让用户自由画线，而是提供一套轻量业务建模语法：

> 用层级定义空间，用节点承载对象，用节点样式表达语义，用通路表达关系，再由画布统一呈现。

相比自由画布，这种方式更容易保持图形结构一致，也更适合频繁调整业务对象和关系。

### 2.2 已确认的功能与特性

| 能力域 | 观察到的功能/特性 | 用户可实现的效果 |
| --- | --- | --- |
| 模式管理 | 【竞品已确认】查看模式、编辑模式切换；编辑模式受密码保护 | 将阅读与建模操作分离，降低误改风险 |
| 通路图管理 | 【竞品已确认】当前图编号、导入、导出、获取分享链接、保存至云端 | 交换、分享和持久化一张业务图 |
| 布局配置 | 【竞品已确认】左右间距、上下间距、节点字号、拆解信息字号 | 调整画布密度和阅读尺度 |
| 层级管理 | 【竞品已确认】层级配置、顶层/子层级、名称、顺序和删除入口 | 建立阶段、领域、部门、产品层次或技术分层 |
| 节点管理 | 【竞品已确认】节点名称、节点类型、所在层级、拆解信息；画布节点可进入编辑 | 将业务对象放入准确层级，并补充拆解说明 |
| 节点样式管理 | 【竞品已确认】样式含义、分组、边框类型/颜色/宽度/弧度、节点颜色、文字颜色 | 用稳定视觉编码表达“已确认、带风险、未确定”等业务语义 |
| 通路管理 | 【竞品已确认】新增通路、已有通路列表、按节点序列展示通路 | 将跨层级节点串联为端到端路径 |
| 画布呈现 | 【竞品已确认】层级分区、节点块、多色通路线、自动呈现 | 在一张图上同时观察业务分层和跨层关系 |
| 查询阅读 | 【竞品已确认】按住 Ctrl 多选节点，查看符合条件的通路；节点样式图例；通路结果列表 | 从复杂全图中筛出与关注节点相关的路径 |

#### 四类核心对象 CRUD 矩阵

用户已确认竞品以层级、节点、通路、节点样式的增删查改为核心；页面中的新增入口、配置列表、属性表单和删除控件与该结论一致。

| 核心对象 | 新增 Create | 查看 Read | 修改 Update | 删除 Delete |
| --- | --- | --- | --- | --- |
| 层级 | 【竞品已确认】新增顶层/子层级 | 【竞品已确认】配置树与画布分区 | 【竞品已确认】名称与顺序调整 | 【竞品已确认】层级删除入口 |
| 节点 | 【竞品已确认】新建节点表单 | 【竞品已确认】画布节点与详情 | 【竞品已确认】点击节点进入编辑 | 【竞品已确认】节点删除入口 |
| 节点样式 | 【竞品已确认】新增样式入口 | 【竞品已确认】样式配置列表与图例 | 【竞品已确认】视觉属性编辑 | 【竞品已确认】样式删除入口 |
| 通路 | 【竞品已确认】新增通路 | 【竞品已确认】通路列表与画布连线 | 【竞品已确认】通路节点序列编辑 | 【竞品已确认】通路删除入口 |

这里的“查”指列表展示、选中、定位和在画布中查看，不等同于复杂条件检索。

### 2.3 核心对象模型推断

【合理推断】竞品至少包含以下对象：

- **通路图**：全部配置的顶层容器；
- **层级**：支持父子关系和顺序的树形结构；
- **节点**：属于一个可承载节点的层级；
- **节点样式/类型**：保存节点的语义与视觉属性；
- **通路**：引用多个节点，并保留节点顺序；
- **布局配置**：控制层级间距、节点间距和字号；
- **渲染结果**：根据以上配置生成层级容器、节点和通路线。

其中，通路更接近“有序节点集合”，连线是相邻步骤的渲染结果，而不是用户任意绘制的独立边。

### 2.4 用户能实现的效果

- 把复杂业务拆成可命名、可排序的层级框架；
- 把产品、系统、活动、成果、角色等对象放入对应层级；
- 用节点样式标记类别、成熟度、风险或确认状态；
- 建立多条跨层级业务路径，并识别共享节点；
- 通过筛选、高亮和图例降低复杂图的阅读成本；
- 调整配置后自动获得一致的前端图形，无需手工维护大量连线。

### 2.5 典型使用场景

【合理推断】

1. 跨部门端到端业务流程梳理；
2. 产品、解决方案或技术规划中的阶段—产品—技术映射；
3. 研发、交付、服务等价值链展示；
4. 组织职责与关键业务节点的对应关系；
5. 多条业务路径的共享节点与差异对比；
6. 向管理者、评审者或项目参与者呈现复杂业务全貌。

### 2.6 竞品优点与可改进机会

**优点**

- 结构化配置驱动画布，图形一致性高；
- 层级、节点、样式和通路四类核心对象足以覆盖多数业务通路图；
- 查看模式支持节点组合查询，强化了图的“查询工具”属性；
- 样式具有语义含义，不只是装饰。

**可改进机会**

- 编辑配置面板分散并遮挡画布，选择对象与属性编辑的联动不够统一；
- 通路列表占用较大空间，复杂图中需要更强的聚焦、弱化和定位机制；
- “节点类型”和“节点样式”的业务概念需要明确，避免视觉属性与业务分类混用；
- 自研产品应补齐撤销重做、修改状态、依赖检查和稳定保存反馈；
- 画布、结构树、属性面板应共享单一选中状态，减少多处寻找对象。

### 2.7 竞品分析结论

自研产品应复用竞品的**核心能力抽象**，而不是复制页面：

> 结构化配置是事实源，画布是实时呈现；层级负责定位，节点负责承载，样式负责语义，通路负责关系。

## 3. 产品设计 V1.0

### 3.1 产品目标

【自研方案】V1.0 目标是建立“单用户结构化建模 + 稳定呈现”的完整闭环：

1. 用户可以从空白图创建层级、节点样式、节点和通路；
2. 所有配置实时反映到画布；
3. 用户可以稳定保存、重新打开并获得一致结果；
4. 查看者可以搜索、定位和高亮关注的节点或通路；
5. 删除、迁移和样式替换不会破坏对象引用。

### 3.2 设计原则

- **结构化而非自由绘制**：用户编辑业务对象，系统计算连线和布局。
- **数据配置是事实源**：画布不维护一套与配置分离的隐式数据。
- **查看/编辑严格分态**：查看模式不出现易误触的编辑入口。
- **语义样式优先**：V1 不引入独立 NodeType；用语义化 NodeStyle 同时承载类别/状态含义与视觉表达，多标签和独立类型体系进入 V1.1。
- **实时联动**：结构树、画布、属性面板共享同一选中对象。
- **操作可恢复**：提供撤销重做、草稿恢复和清晰保存状态。
- **V1 控制复杂度**：通路使用有序节点序列，不支持任意网络、环路和条件边。

### 3.3 用户角色

| 角色 | 核心任务 | 默认能力 |
| --- | --- | --- |
| 建模者 | 创建并维护层级、节点、样式和通路 | 编辑、保存、导入导出 |
| 审阅者 | 检查结构和路径，提出修改意见 | 查看、高亮、查询；评论进入后续版本 |
| 查看者 | 理解业务全貌或追踪某条通路 | 查看、搜索、定位、分享 |

V1.0 优先实现单用户编辑闭环；组织权限和多人实时协作进入 V1.1。

### 3.4 产品架构

产品由五层能力组成：

1. **产品入口层**：通路图库、编辑器、查看页；
2. **结构化配置层**：层级、节点、节点样式、通路、查询定位；
3. **画布引擎层**：自动布局、节点渲染、通路渲染、选择联动、导航高亮；
4. **编辑保障层**：规则校验、依赖检查、命令历史、草稿恢复、保存反馈；
5. **数据模型层**：统一 Diagram Schema、持久化、引用完整性和后续版本迁移。

可编辑的产品功能架构图见文末图 1。

### 3.5 核心对象模型

| 对象 | 核心字段 | 说明 |
| --- | --- | --- |
| Diagram | ID、名称、说明、方向、主题、状态、更新时间 | 全部对象的顶层容器 |
| Layer | ID、父层级 ID、名称、排序 | 构成无环层级树 |
| Node | ID、名称、层级 ID、样式 ID、说明、排序 | 承载具体业务对象 |
| NodeStyle | ID、名称、填充、边框、文字、形状、图标、是否默认 | 定义稳定视觉语义 |
| Pathway | ID、名称、颜色、线型、显示状态、排序 | 表示一条完整通路 |
| PathStep | ID、通路 ID、节点 ID、步骤序号 | 表示节点在通路中的位置 |
| LayoutConfig | 方向、层级间距、节点间距、对齐方式、字号 | 控制自动布局 |

核心关系：

- 一张 Diagram 包含多个 Layer、Node、NodeStyle 和 Pathway；
- Layer 通过 `parentId` 形成无环树；
- 一个 Node 属于一个叶子 Layer，并应用一个主 NodeStyle；
- 一条 Pathway 包含至少两个有序 PathStep；
- 一个 PathStep 引用一个 Node；同一 Node 可被多条 Pathway 引用；
- 相邻 PathStep 间的 Edge 是渲染结果，不是 V1 独立编辑对象。

可编辑对象关系图见文末图 2。

### 3.6 功能组成与优先级

| 模块 | 功能范围 | 版本优先级 |
| --- | --- | --- |
| 通路图管理 | 新建、打开、重命名、复制、删除、保存、重新打开 | P0 |
| 层级管理 | 树形展示、单个/批量新增、删改、排序、移动、影响检查 | P0 |
| 节点管理 | 单个/批量新增、删改查、搜索定位、层级归属、样式应用、排序 | P0 |
| 节点样式 | 样式 CRUD、默认样式、实时预览、引用替换 | P0 |
| 通路管理 | 通路 CRUD、画布点选节点、有序步骤列表、排序、显示隐藏、高亮 | P0 |
| 画布呈现 | 层级容器、节点、方向连线、自动布局、缩放、平移、适应画布 | P0 |
| 查看模式 | 搜索、筛选、定位、节点详情、单/多通路高亮 | P0 |
| 编辑保障 | 校验、依赖提示、撤销重做、修改状态、本地草稿恢复 | P0 |
| 交换与分享 | JSON/图片/PDF 导出、分享链接 | V1.1 候选 |
| 模板 | 空白模板、典型业务模板 | V1.1 候选 |

### 3.7 关键业务规则

#### 层级

- 层级必须形成无环树，不能把父层级移动到自己的后代下；
- 同一父层级下名称不可重复，不同分支可以同名；
- 节点只能放在叶子层级；
- 对已有节点的叶子层级新增子层级时，必须先选择节点迁移目标；
- 超过四级时提示可读性风险，但不硬性禁止。

#### 节点

- 节点名称、所属叶子层级必填；
- 业务允许重名，选择器显示“节点名 · 完整层级路径”；
- 一个节点在 V1 中只属于一个叶子层级并应用一个主样式；
- 节点可以同时参与多条通路；
- V1 不引入独立 NodeType；业务分类或状态通过语义化 NodeStyle 表达，独立类型与多标签体系进入 V1.1。

#### 节点样式

- 系统提供一个不可删除的默认样式；
- 修改样式后，所有引用节点同步更新；
- 删除已使用样式时，必须先指定替代样式；
- 样式名称应表达业务含义，例如“已确认”“待评审”，避免只写“红色”“蓝色”。

#### 通路

- 一条通路至少包含两个节点；
- 节点顺序决定通路方向；
- 同一节点在一条通路中最多出现一次，V1 不支持环路；
- 多条通路可以共享节点；
- 删除通路不删除节点；
- 删除被引用节点前展示受影响通路，并明确相邻步骤的重连结果；
- 删除节点后若某条通路仍有至少两个步骤，则自动连接相邻步骤；若不足两个步骤，则阻止删除，并要求先删除该通路或指定替代节点；
- 通路可单独显示、隐藏或高亮。

#### 画布

- 层级树映射为嵌套容器或泳道；
- 节点所属层级决定其画布区域；
- 通路步骤映射为相邻节点间的有向连接；
- V1 采用自动布局，以层级顺序、节点顺序和通路步骤顺序作为布局输入；
- V1 不开放完全自由拖拽坐标，手动微调和位置锁定进入 V1.1。

### 3.8 关键用户流程

`新建通路图 → 建立层级树 → 定义节点样式 → 创建并归属节点 → 创建通路并排列节点 → 自动生成画布 → 校验 → 保存 → 切换查看模式验收`

校验未通过时，用户可从问题列表直接定位对象，修正后重新校验。

### 3.9 关键 UI 设计

#### 整体布局

【自研方案】默认以 1440×900、Light、BOCHUI `balance/md` 为基准：

- 48px 全局顶栏：图名、查看/编辑分段、撤销重做、保存状态、保存主按钮；
- 248px 左侧结构面板：结构/样式 Tabs、搜索、层级树、节点数量；
- 中央无限画布：40px 工具条、层级泳道、节点和方向通路；
- 320px 右侧属性面板：根据当前选择展示图、层级、节点、通路或样式属性；
- 28px 底部状态栏：缩放比例、对象数量、校验问题、保存状态。

详细编辑工作台见文末图 3。

#### 查看模式

- 隐藏新增、删除、拖拽、连接和保存等编辑控件；
- 左侧提供结构概览、节点/通路搜索和样式筛选；
- 点击节点后高亮前后关系，其余内容降低对比；
- 右侧使用非模态只读详情抽屉；
- 支持单条通路聚焦、多个节点组合查询、适应画布和缩放。

#### 编辑模式

- 左侧树、画布、右侧属性保持同一选择态；
- 工具条包含选择、框选、平移、新增节点、连接通路、自动布局、缩放与适应画布；
- 新增/重命名优先行内完成，复杂属性进入右侧面板；
- 结构面板提供批量添加：用中文/英文分号或换行分隔名称，同批层级共享上级、同批节点共享叶子层级与样式，预览确认后一次提交并可整体撤销；
- 普通表单底部固定“取消｜确定”，危险操作放入面板底部独立区域；连接通路草稿的主要完成按钮跟随画布末节点；
- 删除层级、节点或样式前展示依赖影响并支持撤销。

#### 通路配置

- 进入连接模式后，顶部显示“依次点击节点建立通路；Enter 完成，Esc 取消”；
- 画布上的候选边使用品牌色虚线，已确认通路使用实线；
- 右侧以有序列表展示步骤序号、节点名、所属层级、拖拽手柄和移除操作；
- 画布点选与列表编辑双向联动，顺序变化实时更新箭头；
- 选中至少两个节点后，“完成通路”贴近最后一个节点，优先在下方出现；如会遮挡其他节点或超出画布，则自适应选择右、左或上方；
- 退出连接模式时清理临时候选，不保留半成品。

详细通路配置见文末图 4。

#### BOCHUI 视觉与组件约束

- 默认 Light，预留 Dark；视觉属性均走 token；
- 品牌色只用于 active、hover、selected、focus 和主操作；
- 成功绿表达保存成功，警告橙表达未保存/影响，错误红表达校验或危险；
- 使用 Tree、Tabs、Toolbar、Segmented、Input、TreeSelect、Tag、Drawer、Dialog、Message Bar 等桌面工具组件；
- 顶栏 48px、树行 32px、工具按钮 32px、属性面板 320px；正文 14px/22px；
- 输入/按钮圆角 4px，菜单/浮动工具条 8px，对话框/抽屉 12px；
- 控件反馈约 0.1s，树/菜单 0.2s，抽屉 0.25s，对话框 0.3s；
- 状态必须覆盖 default、hover、pressed、focus、selected、disabled、loading、error、modified；画布对象额外覆盖 dimmed、creating、read-only。

### 3.10 概念技术架构

V1.0 不进入代码实现，但产品架构应预留以下模块边界：

- **工作台外壳**：路由、模式、主题、面板和快捷键；
- **对象编辑器**：Layer/Node/NodeStyle/Pathway 的表单、列表与树；
- **命令与状态层**：统一选中、撤销重做、脏数据和草稿；
- **规则校验器**：层级无环、叶子归属、样式引用、通路顺序与删除影响；
- **布局与渲染引擎**：由 Diagram Schema 生成层级容器、节点和 Edge；
- **持久化服务**：保存、读取、版本字段和 Schema 迁移；
- **交换层**：导入导出和分享链接。

关键架构决策：`Pathway + 有序 PathStep` 是配置事实；Edge 只在布局/渲染时产生。这样可避免配置列表与画布连线产生双重事实源。

### 3.11 V1.0 验收标准

1. 用户能从空白状态完成层级、样式、节点、通路的完整 CRUD；
2. 每次配置变更后，树、属性面板和画布在一个交互周期内保持一致；
3. 违反核心规则时无法提交，并能定位到具体对象和字段；
4. 删除被引用对象前展示影响范围，确认后引用关系仍保持合法；
5. 保存后重新打开，Diagram Schema 与画布呈现一致；
6. 查看模式不出现可改变数据的操作；
7. 用户能通过搜索、结构树或通路列表定位任意节点；
8. 单条通路高亮时，方向和步骤顺序清晰可辨；
9. 撤销重做覆盖层级、节点、样式和通路的核心编辑命令；
10. 1440×900 下主要工作区无需页面级滚动，面板内部可独立滚动。

### 3.12 V1.1 候选范围

- 任意边、条件分支、汇聚与环路；
- 一个节点属于多个层级或跨图引用；
- 多标签、多状态与样式继承；
- 独立 NodeType、节点多标签及类型—样式映射；
- 手工微调坐标、位置锁定和高级布局策略；
- 多人协作、评论、组织权限和发布流程；
- 历史版本、差异对比和回滚；
- 模板库、全局样式库和开放 API；
- Excel/JSON 导入、图片/PDF 导出；
- 超大图虚拟化和增量布局；
- 移动端查看。

### 3.13 主要风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 通路定义扩展为任意网络 | 数据模型返工 | V1 明确为有序序列，任意边进入 V1.1 |
| 层级调整影响大量节点 | 用户无法预判 | 影响预览、迁移选择、事务提交、撤销 |
| 多通路线交叉严重 | 画布失去可读性 | 自动布局、单通路高亮、显示隐藏、其他对象弱化 |
| 样式沦为随意装饰 | 同色不同义 | 语义命名、默认样式、引用数量和替换策略 |
| 删除造成悬空引用 | 数据损坏 | 统一依赖检查和引用完整性校验 |
| 自动布局不符合预期 | 用户反复调整 | V1 暴露排序/方向/间距；V1.1 支持位置锁定 |
| V1 被协作等需求拖大 | 核心闭环延期 | 冻结为单用户结构化建模 + 稳定呈现 |
| 保存恢复不可靠 | 用户不敢用于真实业务 | 草稿恢复、明确状态、重开一致性验收 |

## 4. 可编辑设计图

以下图稿均以 Confluence 原生 draw.io 宏交付，可在页面中继续编辑：

1. 产品功能架构图；
2. 核心对象模型图；
3. BOCHUI 编辑工作台 UI 示意；
4. BOCHUI 通路配置 UI 示意。

eyJleHRTcnZJbnRlZ1R5cGUiOiIiLCJnQ2xpZW50SWQiOiIiLCJjcmVhdG9yTmFtZSI6IueOi+aZtiIsIm91dHB1dFR5cGUiOiJibG9jayIsImxhc3RNb2RpZmllck5hbWUiOiLnjovmmbYiLCJsYW5ndWFnZSI6InpoIiwiZGlhZ3JhbURpc3BsYXlOYW1lIjoiIiwic0ZpbGVJZCI6IiIsImF0dElkIjoiNzY4NTIzNTM0IiwiZGlhZ3JhbU5hbWUiOiJwYXRod2F5LXByb2R1Y3QtYXJjaGl0ZWN0dXJlLXYxLmRyYXdpbyIsImFzcGVjdCI6IiIsImxpbmtzIjoiYXV0byIsImNlb05hbWUiOiLkuJrliqHkvZzlm753ZWLlt6XlhbciLCJ0YnN0eWxlIjoidG9wIiwiY2FuQ29tbWVudCI6dHJ1ZSwiZGlhZ3JhbVVybCI6IiIsImNzdkZpbGVVcmwiOiIiLCJib3JkZXIiOnRydWUsIm1heFNjYWxlIjoiMSIsIm93bmluZ1BhZ2VJZCI6NzY4NTIzNTI5LCJlZGl0YWJsZSI6dHJ1ZSwiY2VvSWQiOjc2ODUyMzUyOSwicGFnZUlkIjoiIiwibGJveCI6dHJ1ZSwic2VydmVyQ29uZmlnIjp7ImVtYWlscHJldmlldyI6IjEifSwib2RyaXZlSWQiOiIiLCJyZXZpc2lvbiI6MiwibWFjcm9JZCI6ImEwMjU4MzE5LTQxMWEtNDE0OC1hMTExLTUzZmU0NTQzMzU3OSIsInByZXZpZXdOYW1lIjoicGF0aHdheS1wcm9kdWN0LWFyY2hpdGVjdHVyZS12MS5kcmF3aW8ucG5nIiwibGljZW5zZVN0YXR1cyI6Ik9LIiwic2VydmljZSI6IiIsImlzVGVtcGxhdGUiOiIiLCJ3aWR0aCI6IjE0MDAiLCJzaW1wbGVWaWV3ZXIiOmZhbHNlLCJsYXN0TW9kaWZpZWQiOjE3ODc5MTg5OTEwNjAsImV4Y2VlZFBhZ2VXaWR0aCI6ZmFsc2UsIm9DbGllbnRJZCI6IiJ9

eyJleHRTcnZJbnRlZ1R5cGUiOiIiLCJnQ2xpZW50SWQiOiIiLCJjcmVhdG9yTmFtZSI6IueOi+aZtiIsIm91dHB1dFR5cGUiOiJibG9jayIsImxhc3RNb2RpZmllck5hbWUiOiLnjovmmbYiLCJsYW5ndWFnZSI6InpoIiwiZGlhZ3JhbURpc3BsYXlOYW1lIjoiIiwic0ZpbGVJZCI6IiIsImF0dElkIjoiNzY4NTIzNTM2IiwiZGlhZ3JhbU5hbWUiOiJwYXRod2F5LWRvbWFpbi1tb2RlbC12MS5kcmF3aW8iLCJhc3BlY3QiOiIiLCJsaW5rcyI6ImF1dG8iLCJjZW9OYW1lIjoi5Lia5Yqh5L2c5Zu+d2Vi5bel5YW3IiwidGJzdHlsZSI6InRvcCIsImNhbkNvbW1lbnQiOnRydWUsImRpYWdyYW1VcmwiOiIiLCJjc3ZGaWxlVXJsIjoiIiwiYm9yZGVyIjp0cnVlLCJtYXhTY2FsZSI6IjEiLCJvd25pbmdQYWdlSWQiOjc2ODUyMzUyOSwiZWRpdGFibGUiOnRydWUsImNlb0lkIjo3Njg1MjM1MjksInBhZ2VJZCI6IiIsImxib3giOnRydWUsInNlcnZlckNvbmZpZyI6eyJlbWFpbHByZXZpZXciOiIxIn0sIm9kcml2ZUlkIjoiIiwicmV2aXNpb24iOjIsIm1hY3JvSWQiOiJlN2QzM2NjZi0zMjk5LTRjYmItOTAyZi04MTBmMWEwOGFkZWYiLCJwcmV2aWV3TmFtZSI6InBhdGh3YXktZG9tYWluLW1vZGVsLXYxLmRyYXdpby5wbmciLCJsaWNlbnNlU3RhdHVzIjoiT0siLCJzZXJ2aWNlIjoiIiwiaXNUZW1wbGF0ZSI6IiIsIndpZHRoIjoiMTQwMCIsInNpbXBsZVZpZXdlciI6ZmFsc2UsImxhc3RNb2RpZmllZCI6MTc4NzkxODk5MjU3MCwiZXhjZWVkUGFnZVdpZHRoIjpmYWxzZSwib0NsaWVudElkIjoiIn0=

eyJleHRTcnZJbnRlZ1R5cGUiOiIiLCJnQ2xpZW50SWQiOiIiLCJjcmVhdG9yTmFtZSI6IueOi+aZtiIsIm91dHB1dFR5cGUiOiJibG9jayIsImxhc3RNb2RpZmllck5hbWUiOiLnjovmmbYiLCJsYW5ndWFnZSI6InpoIiwiZGlhZ3JhbURpc3BsYXlOYW1lIjoiIiwic0ZpbGVJZCI6IiIsImF0dElkIjoiNzY4NTIzNTM4IiwiZGlhZ3JhbU5hbWUiOiJwYXRod2F5LWVkaXRvci1ib2NodWktdjEuZHJhd2lvIiwiYXNwZWN0IjoiIiwibGlua3MiOiJhdXRvIiwiY2VvTmFtZSI6IuS4muWKoeS9nOWbvndlYuW3peWFtyIsInRic3R5bGUiOiJ0b3AiLCJjYW5Db21tZW50Ijp0cnVlLCJkaWFncmFtVXJsIjoiIiwiY3N2RmlsZVVybCI6IiIsImJvcmRlciI6dHJ1ZSwibWF4U2NhbGUiOiIxIiwib3duaW5nUGFnZUlkIjo3Njg1MjM1MjksImVkaXRhYmxlIjp0cnVlLCJjZW9JZCI6NzY4NTIzNTI5LCJwYWdlSWQiOiIiLCJsYm94Ijp0cnVlLCJzZXJ2ZXJDb25maWciOnsiZW1haWxwcmV2aWV3IjoiMSJ9LCJvZHJpdmVJZCI6IiIsInJldmlzaW9uIjoyLCJtYWNyb0lkIjoiNDMxNGM5MmQtZjc2Mi00MDA3LThmOTQtNGMyMzRiMjA4MTdlIiwicHJldmlld05hbWUiOiJwYXRod2F5LWVkaXRvci1ib2NodWktdjEuZHJhd2lvLnBuZyIsImxpY2Vuc2VTdGF0dXMiOiJPSyIsInNlcnZpY2UiOiIiLCJpc1RlbXBsYXRlIjoiIiwid2lkdGgiOiIxNDAwIiwic2ltcGxlVmlld2VyIjpmYWxzZSwibGFzdE1vZGlmaWVkIjoxNzg3OTE4OTk0MDkyLCJleGNlZWRQYWdlV2lkdGgiOmZhbHNlLCJvQ2xpZW50SWQiOiIifQ==

eyJleHRTcnZJbnRlZ1R5cGUiOiIiLCJnQ2xpZW50SWQiOiIiLCJjcmVhdG9yTmFtZSI6IueOi+aZtiIsIm91dHB1dFR5cGUiOiJibG9jayIsImxhc3RNb2RpZmllck5hbWUiOiLnjovmmbYiLCJsYW5ndWFnZSI6InpoIiwiZGlhZ3JhbURpc3BsYXlOYW1lIjoiIiwic0ZpbGVJZCI6IiIsImF0dElkIjoiNzY4NTIzNTQwIiwiZGlhZ3JhbU5hbWUiOiJwYXRod2F5LWNvbmZpZy1ib2NodWktdjEuZHJhd2lvIiwiYXNwZWN0IjoiIiwibGlua3MiOiJhdXRvIiwiY2VvTmFtZSI6IuS4muWKoeS9nOWbvndlYuW3peWFtyIsInRic3R5bGUiOiJ0b3AiLCJjYW5Db21tZW50Ijp0cnVlLCJkaWFncmFtVXJsIjoiIiwiY3N2RmlsZVVybCI6IiIsImJvcmRlciI6dHJ1ZSwibWF4U2NhbGUiOiIxIiwib3duaW5nUGFnZUlkIjo3Njg1MjM1MjksImVkaXRhYmxlIjp0cnVlLCJjZW9JZCI6NzY4NTIzNTI5LCJwYWdlSWQiOiIiLCJsYm94Ijp0cnVlLCJzZXJ2ZXJDb25maWciOnsiZW1haWxwcmV2aWV3IjoiMSJ9LCJvZHJpdmVJZCI6IiIsInJldmlzaW9uIjoyLCJtYWNyb0lkIjoiMjRhOGQ5MDItMzUwMi00NWEwLThlZDItMjMzYWY3OWNiNTY5IiwicHJldmlld05hbWUiOiJwYXRod2F5LWNvbmZpZy1ib2NodWktdjEuZHJhd2lvLnBuZyIsImxpY2Vuc2VTdGF0dXMiOiJPSyIsInNlcnZpY2UiOiIiLCJpc1RlbXBsYXRlIjoiIiwid2lkdGgiOiIxNDAwIiwic2ltcGxlVmlld2VyIjpmYWxzZSwibGFzdE1vZGlmaWVkIjoxNzg3OTE4OTk1NzEzLCJleGNlZWRQYWdlV2lkdGgiOmZhbHNlLCJvQ2xpZW50SWQiOiIifQ==
