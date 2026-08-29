# 业务通路图 Web 工具 V1.0

一个由结构化 `Diagram` 数据驱动的业务通路图桌面 Web 工具。用户维护层级、节点、语义节点样式和有序通路；画布坐标与连线均自动派生，不保存自由坐标或独立 Edge。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:5173/diagrams`。首次运行会在浏览器本地存储中创建“需求到交付示例”。

Windows 用户也可以直接双击根目录的 `start.bat`：脚本会在缺少依赖时自动执行安装，启动开发服务器并打开图库页面。关闭开发服务器窗口即可停止服务。

## 验证

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

首次运行 E2E 前如本机尚未安装 Chromium，请执行 `npx playwright install chromium`。

## 架构

- `src/domain`：V1.0 持久化类型、Zod Schema、稳定错误码、不变量、选择器与种子数据。
- `src/editor`：所有事实数据写入所经过的领域命令、100 步 Undo/Redo 与 Zustand 编辑状态。
- `src/layout`：从 Pathway 步骤派生 Edge，以及相同输入得到相同坐标的 TB/LR 泳道布局。
- `src/persistence`：Repository 接口与 localStorage Adapter；正式文档、摘要索引和草稿分 key 存储，并使用 revision 乐观锁。
- `src/features`：图库、三栏工作台、统一 Selection、Inspector CRUD、查看查询和 React Flow 派生画布。

## 本地存储

- `pathway:v1:index`
- `pathway:v1:diagram:<diagramId>`
- `pathway:v1:draft:<diagramId>`

每个领域命令在 500ms 防抖后写草稿；手动保存递增 revision、清除草稿并重置命令历史。加载到更新草稿时由用户选择恢复或放弃。

## V1.0 边界

不支持独立 NodeType、独立持久化 Edge、条件分支/环路、同一路径重复节点、自由坐标拖拽、手工折线、多人协作和导入导出。画布上的节点与连线都是 `Diagram` 的派生视图。
