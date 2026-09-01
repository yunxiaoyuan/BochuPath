# BochuPath 业务通路图 Web 工具 V1.0

一个由结构化 `Diagram` 数据驱动的业务通路图桌面 Web 工具。用户维护层级、节点、语义节点样式和通路节点集合；画布坐标和有向边均自动派生，不保存自由坐标或独立 Edge。通路是分层有向图，不是节点步骤链。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:5173/diagrams`。首次运行会从初始种子创建 `.bochupath/bochupath-data.json`；本机不同浏览器访问同一开发服务器时也读取这份共享数据。

Windows 用户也可以直接双击根目录的 `start.bat`：脚本会在缺少依赖时自动执行安装，启动开发服务器并打开图库页面。关闭开发服务器窗口即可停止服务。

## 验证

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

首次运行 E2E 前如本机尚未安装 Chromium，请执行 `npx playwright install chromium`。

E2E 同时运行 `@axe-core/playwright` 的浅色/深色主题 WCAG 2 A/AA 自动扫描。自动扫描不能替代人工键盘、焦点顺序、200% 缩放和读屏验收。

## 架构

- `src/domain`：V1.1 持久化类型、V1.0 显式迁移、Zod Schema、稳定错误码、叶子层级/同层节点固定顺序、不变量与种子数据。
- `src/editor`：所有事实数据写入所经过的领域命令、100 步 Undo/Redo 与 Zustand 编辑状态。
- `src/layout`：从 Pathway 节点集合派生分层有向 Edge，以及相同输入得到相同坐标的 TB/LR 泳道布局。
- `src/persistence`：Repository 接口、localStorage Adapter 与 PageDrop 共享 JSON Adapter；所有正式保存使用 revision 乐观锁，个人草稿始终留在当前浏览器。
- `src/features`：图库、三栏工作台、统一 Selection、Inspector CRUD、查看查询和 React Flow 派生画布。

画布的“布局”和“适应”以实际可见画布尺寸和布局边界计算缩放，不会把三栏工作台外框误当作可用区域；在 16:9 等宽屏中优先让同层节点保持单行，通过缩窄节点、按文字换行增高、压缩间距提高整图字号的屏幕可读性，只有单行缩放低于可读性下限时才自动换行。宽屏顶栏可随时收起对象面板或属性面板，为密集图释放更多空间。确认通路和新建草稿都显示方向箭头，不显示链式步骤序号。层级树、节点/通路列表、画布和 Inspector 共用同一个选择状态，并支持鼠标与键盘操作。

通路只持久化 `nodeIds` 节点成员集合。系统按层级树中叶子层级的深度优先顺序识别通路实际占用的层级，跳过空层，并在相邻占用层之间做笛卡尔积全连接；同层节点互不连边。TB/LR 只改变呈现方向，不改变从上一占用层到下一占用层的业务方向。通路至少占用两个不同层级。

通路节点直接在画布上编辑。新建时普通点击未选节点加入，`Shift+点击` 已选节点移除，至少占用两层后创建；已有通路在编辑模式下一经选中即可编辑，`Shift+点击` 立即执行可撤销的节点增删命令，普通点击节点则退出通路编辑并选中该节点。Inspector 按占用层显示节点数、层数和派生边数，不提供二次“在画布编辑”入口。属性仍通过“确定/取消”提交，且不会覆盖已即时修改的节点集合。

在编辑或查看模式单选节点时，应用会高亮该节点参与的全部可见通路，以及这些通路的完整成员节点和派生箭头；隐藏通路保持隐藏，详情区分别显示可见/隐藏数量。单通路聚焦优先，Ctrl/Cmd 多选仍用于查询同时包含全部所选节点的通路。

编辑/选择模式下可直接拖动层级调整同级顺序，或拖动节点调整同一叶子层级内的顺序；TB 布局对应层级纵向、节点横向，LR 布局对应层级横向、节点纵向。拖动采用手机桌面图标式反馈：拖动物浮起跟手移动，经过槽位时同组对象实时让位，松手后平滑吸附；不叠加吸附框或目标序号等遮挡信息。拖拽过程由 React Flow 的单一受控节点状态更新，起拖时不切换全局选中态或改变节点尺寸，避免坐标回写和视觉跳变。拖动只提交结构化 `order` 命令，不保存自由坐标，支持撤销/重做、草稿、保存和刷新重开；后续新增对象只追加在末尾，不会覆盖已经调整的顺序。键盘可使用 `Alt+方向键` 完成等价排序。

结构面板支持批量添加层级或节点：中文分号、英文分号和换行均可分隔名称；同一批层级共享上级，同一批节点共享叶子层级与样式。添加节点时，所属叶子层级默认取当前选中的叶子层级（选中节点时取其所属层级），无上下文时回退到第一个叶子层级；添加过程中切换选中叶子层级，所属层级会同步更新。提交前会按输入顺序预览并检查名称，整批写入只产生一条撤销历史。

## 本机数据与个人草稿

`npm run dev` 使用与 PageDrop 相同的共享 JSON Repository，正式数据保存在被 Git 忽略的 `.bochupath/bochupath-data.json`。`public/bochupath-data.json` 只负责初始化和构建产物的首次发布数据，运行时保存不会改动它。

个人草稿和不支持 JSON 写入的普通静态托管使用浏览器存储：

- `bochupath:v1:index`
- `bochupath:v1:diagram:<diagramId>`
- `bochupath:v1:draft:<diagramId>`

进入浏览器存储兜底模式时，会把旧的 `pathway:v1:*` 数据复制迁移到 `bochupath:v1:*`；为便于恢复，旧 key 不会自动删除。切换到本机共享 JSON 不会删除任何旧浏览器数据。

每个领域命令在 500ms 防抖后写草稿；手动保存递增 revision、清除草稿并重置命令历史。脏状态相对于最近一次成功保存的事实数据计算，因此撤销回保存基线会恢复“已保存”状态并清理草稿，重做后重新变为未保存。加载到更新草稿时由用户选择恢复或放弃。

返回图库或从编辑切换到查看时，未保存内容由应用内对话框拦截。沙箱无法可靠拦截用户关闭父页面，因此不把 `beforeunload` 原生弹窗作为数据保障，关闭/刷新后的恢复依赖个人草稿。

## PageDrop 可运行副本

生产构建可以将 `dist/` 打包为包含 `index.html` 的 zip 后上传到 PageDrop。Vite 只在本地构建，PageDrop 只运行静态文件。构建产物使用相对资源路径；应用在 PageDrop 页面中自动切换为 Hash 路由，并通过 PageDrop JSON SDK 或带 `credentials: "include"` 的同外链相对请求读写 `bochupath-data.json`。多人可在不同浏览器中异步编辑：保存时递增 Diagram revision，其他协作者刷新、重新打开或回到图库后读取最新版本；基于旧 revision 的保存会被拒绝，本地草稿不会丢失。

PageDrop 的 JSON 覆盖写接口目前没有原子 compare-and-swap，因此这是异步协作而不是实时同屏协作。应避免两人同时在数秒内保存同一张图；更新 PageDrop 代码包时必须先下载线上 `bochupath-data.json`。Schema 不变时原样保留，Schema 升级时运行显式迁移并校验所有业务对象后再合包。本机开发通过 Vite 的同名 JSON 读写端点复现相同语义；嵌入环境限制浏览器存储时个人草稿降级到当前会话内存。

线上 PageDrop iframe 权限为 `allow-scripts allow-same-origin allow-popups`。React、ES Module、DOM/SVG、React Flow、Pointer/Keyboard 事件、ResizeObserver 和 Hash 路由可用；沙箱没有 `allow-forms`、`allow-modals` 或 `allow-downloads`。因此所有表单都阻止原生导航并由 React 事件提交，确认和错误使用应用内组件，V1 不依赖 Blob 下载。应用不使用 Worker、Service Worker、父窗口 DOM、顶层跳转、全屏、Pointer Lock 或跨域接口。

Playwright 使用与线上相同的完整 sandbox 字符串回归图库/Inspector CRUD、跨层与同层多节点通路、画布直接编辑、编辑/查看关联高亮、共享保存、刷新重开、草稿恢复、版本冲突、应用内 Dialog、键盘、拖动、缩放和 200% 浏览器缩放，并检查页面控制台错误。真实已发布外链的写入测试需要单独配置 PageDrop API Token，本仓库测试不会修改线上外链。

## V1.0 边界

不支持独立 NodeType、独立持久化或手工选择 Edge、条件边、环路、同一通路重复节点、自由坐标定位/锁定、手工折线、多人实时同屏协作、自动合并、评论和导入导出。同层多节点会通过相邻占用层全连接自动形成分支与汇聚，但不支持只保留其中部分边。画布拖动仅调整层级或节点的结构化 `order`；节点与连线仍是 `Diagram` 的确定性派生视图。
