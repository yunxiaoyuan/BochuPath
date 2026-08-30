# BochuPath 业务通路图 Web 工具 V1.0

一个由结构化 `Diagram` 数据驱动的业务通路图桌面 Web 工具。用户维护层级、节点、语义节点样式和有序通路；画布坐标与连线均自动派生，不保存自由坐标或独立 Edge。

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

- `src/domain`：V1.0 持久化类型、Zod Schema、稳定错误码、不变量、选择器与种子数据。
- `src/editor`：所有事实数据写入所经过的领域命令、100 步 Undo/Redo 与 Zustand 编辑状态。
- `src/layout`：从 Pathway 步骤派生 Edge，以及相同输入得到相同坐标的 TB/LR 泳道布局。
- `src/persistence`：Repository 接口、localStorage Adapter 与 PageDrop 共享 JSON Adapter；所有正式保存使用 revision 乐观锁，个人草稿始终留在当前浏览器。
- `src/features`：图库、三栏工作台、统一 Selection、Inspector CRUD、查看查询和 React Flow 派生画布。

画布的“布局”和“适应”以实际可见画布尺寸和布局边界计算缩放，不会把三栏工作台外框误当作可用区域；在 16:9 等宽屏中优先让同层节点保持单行，通过缩窄节点、按文字换行增高、压缩间距提高整图字号的屏幕可读性，只有单行缩放低于可读性下限时才自动换行。宽屏顶栏可随时收起对象面板或属性面板，为密集图释放更多空间。确认通路和连接草稿都显示方向箭头及步骤序号。连接模式支持连续点选；选满两个节点后，“完成通路”会贴近最后一个节点，并依据当前缩放、画布边界和其他节点占位自动选择下、右、左或上方。层级树、节点/通路列表、画布和 Inspector 共用同一个选择状态，并支持鼠标与 Enter/Space 键操作。

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

## PageDrop 可运行副本

生产构建可以将 `dist/` 打包为包含 `index.html` 的 zip 后上传到 PageDrop。构建产物使用相对资源路径；应用在 PageDrop 页面中自动切换为 Hash 路由，并把正式数据读写到同一外链下的 `bochupath-data.json`。多人可在不同浏览器中异步编辑：保存时递增 Diagram revision，其他协作者刷新、重新打开或回到图库后读取最新版本；基于旧 revision 的保存会被拒绝，本地草稿不会丢失。

PageDrop 的 JSON 覆盖写接口目前没有原子 compare-and-swap，因此这是异步协作而不是实时同屏协作。应避免两人同时在数秒内保存同一张图；更新 PageDrop 代码包时必须先下载并原样保留线上 `bochupath-data.json`。本机开发通过 Vite 的同名 JSON 读写端点复现相同语义；嵌入环境限制浏览器存储时个人草稿降级到当前会话内存。

所有关键确认操作都使用应用内 React 对话框和显式事务，不依赖浏览器原生表单导航、`window.confirm` 或 `window.prompt`，因此在 PageDrop sandbox iframe 未开放 `allow-forms` / `allow-modals` 时仍可操作。回归测试覆盖从空白图创建，图库重命名、复制、删除，以及 Inspector 的层级、节点、批量添加和节点删除。

## V1.0 边界

不支持独立 NodeType、独立持久化 Edge、条件分支/环路、同一路径重复节点、自由坐标定位/锁定、手工折线、多人实时同屏协作、自动合并、评论和导入导出。画布拖动仅调整 `order`，节点与连线仍是 `Diagram` 的确定性派生视图。
