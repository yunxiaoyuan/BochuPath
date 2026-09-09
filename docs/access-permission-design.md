# BochuPath 企业微信登录与权限设计 V1.1（纯文字）

> 实施状态（2026-09-09）：本文定义的身份、Reader/Editor/Admin、申请审批、邀请、直接授权、撤权、最后管理员保护、HTTP Repository、审计、可选企微通知和旧 JSON 迁移已在 `feature/wecom-auth` 实现并通过本地自动化验收。正式上线仍需填写企业微信应用参数、初始管理员准确 `userId`、允许的根部门 ID 和 HTTPS 域名，并在真实企业微信环境完成回调与组织范围验收。

> 文档版本：V1.1 ｜ 日期：2026-09-09 ｜ 状态：代码已实现并通过本地验收，待企业微信参数与生产环境联调

## 1. 目标与结论

BochuPath 面向企业内部使用，采用企业微信统一身份，不建立用户名和密码体系。

目标规则：

1. 只有企业微信“柏楚”组织内部成员可以进入系统；
2. 内部成员首次进入默认为只读用户；
3. 写权限只能通过管理员邀请、用户申请后审批、管理员直接开通三种方式获得；
4. 权限判断必须在服务器执行，前端隐藏按钮只用于交互提示，不能作为安全边界；
5. 所有授权、拒绝、撤销和写操作必须可审计。

当前 PageDrop 外链已经启用“柏楚”根部门白名单，能够完成第 1 条。当前 BochuPath 静态页尚无当前用户身份接口，也没有服务器端读写角色校验，因此现在进入页面的内部成员仍可调用共享 JSON 写接口。V1.1 上线前不得把“按钮隐藏”描述成已经实现了安全权限。

## 2. 范围

### 2.1 V1.1 必须实现

- 企业微信单点登录和当前用户信息；
- 全局 `reader`、`editor`、`admin` 三种角色；
- 默认只读；
- 邀请获得写权限；
- 申请写权限并由管理员审批；
- 管理员直接开通、撤销写权限；
- 所有写接口的服务器端鉴权；
- 权限变更和数据写入审计；
- 角色变化后的即时失效、明确反馈和草稿保护。

### 2.2 V1.1 不做

- 自建账号、密码、短信验证码；
- 企业外部联系人、供应商或匿名访问；
- 单张通路图单独授权；
- 字段级权限；
- 多级审批、自动授权规则；
- 把权限事实存入 `localStorage`、前端变量或可由普通用户写入的 JSON 文件。

单图授权、部门管理员和临时到期权限可以进入后续版本。

## 3. 安全边界

### 3.1 PageDrop 入口权限与 BochuPath 写权限是两层能力

- PageDrop 白名单负责“谁可以加载页面”。现网规则为“柏楚”根部门及其全部子部门成员；未登录用户由 PageDrop 引导企微登录，非组织成员不能进入 iframe。
- BochuPath 权限服务负责“登录用户可以读取还是修改业务数据”。每次创建、导入、保存、重命名、复制和删除都必须由服务器重新校验角色。

PageDrop 当前静态页运行时只提供文件读取/写入能力，没有可供 BochuPath 使用的稳定企微 `userId` 和角色接口；现有共享 `bochupath-data.json` 也不能安全存放角色，因为能写业务 JSON 的用户就可能修改自己的角色。

### 3.2 禁止的伪权限方案

- 只在 React 中隐藏“编辑”“保存”“删除”等按钮；
- 从 URL、用户输入、前端 Cookie、`localStorage` 或 JSON 中读取角色并直接信任；
- 让前端把 `userId` 作为请求参数交给服务器判断身份；
- 继续允许所有已登录成员直接调用未鉴权的 `saveJSON`，同时声称系统已区分读写；
- 自动把第一个登录用户设为管理员。

这些方案可以被浏览器开发者工具或直接请求绕过。

## 4. 推荐架构

```text
企业微信成员
  │ 企微 SSO
  ▼
PageDrop 入口门禁（柏楚根部门白名单）
  │ 已认证、同源安全会话
  ▼
BochuPath SPA
  ├─ GET /api/bochupath/v1/session ──────► 身份与权限服务
  ├─ GET /api/bochupath/v1/diagrams ─────► 业务数据服务
  └─ POST/PUT/DELETE（带 CSRF、revision）► 服务端角色校验
                                              │
                    ┌─────────────────────────┼────────────────────┐
                    ▼                         ▼                    ▼
               角色/申请库               通路图数据库          不可变审计日志
```

推荐把 API 放在 PageDrop 同源反向代理后，例如 `/api/bochupath/v1/*`。网关从 PageDrop/企微登录会话取得可信的 `userId`，通过签名请求上下文传给 BochuPath 服务；前端永远不提交或覆盖当前身份。

如果 PageDrop 暂时无法向后端传递当前企微身份，则使用独立的 BochuPath 服务完成企微 OAuth，并把前端继续作为 PageDrop 静态资源部署。无论采用哪种方式，最终都必须做到：读取可面向全体内部成员，写入必须在服务器端校验 `editor/admin`。

### 4.1 对 PageDrop 的最小平台能力要求

推荐为受限外链增加以下服务器能力：

1. 返回当前访问者的企微身份，不向前端暴露登录票据；
2. 支持链接级“可访问范围”和“可写范围”分离；
3. 对 JSON `PUT` 或 BochuPath 业务写接口执行可写范围校验；
4. 将操作者 `userId`、时间、资源和结果写入审计日志。

在这些能力上线前，当前共享 JSON 仅适合内部协作试用，不具备严格的读写隔离。

## 5. 角色与权限矩阵

| 操作 | Reader 只读者 | Editor 编辑者 | Admin 管理员 |
| --- | --- | --- | --- |
| 企微登录、进入图库 | 允许 | 允许 | 允许 |
| 查看、搜索、筛选、高亮 | 允许 | 允许 | 允许 |
| 导出 JSON | 允许 | 允许 | 允许 |
| 申请写权限 | 允许 | 已有权限，无需申请 | 不需要 |
| 新建、导入、编辑、保存、重命名、复制 | 禁止 | 允许 | 允许 |
| 删除通路图 | 禁止 | 允许，保留审计 | 允许，保留审计 |
| 邀请编辑者 | 禁止 | 禁止 | 允许 |
| 审批写权限申请 | 禁止 | 禁止 | 允许 |
| 直接开通、撤销角色 | 禁止 | 禁止 | 允许 |
| 查看权限审计 | 禁止 | 禁止 | 允许 |

V1.1 采用系统级写权限：获得 `editor` 后可编辑图库内全部通路图。后续如果出现不同项目之间的数据隔离，再增加图级或项目级 ACL，不在本轮提前复杂化。

## 6. 身份与会话

### 6.1 登录流程

1. 用户打开 PageDrop 外链；
2. PageDrop 检查企微会话，没有会话时进入企微登录；
3. PageDrop 检查用户是否属于“柏楚”根部门或子部门；
4. 通过后加载 BochuPath；
5. BochuPath 调用 `GET /api/bochupath/v1/session`；
6. 服务端按企微 `userId` 返回用户资料、角色和权限申请状态；
7. 前端根据服务器结果进入只读、编辑或管理界面。

BochuPath 不显示独立登录表单。登录票据使用 `HttpOnly + Secure + SameSite` Cookie，前端请求统一携带 `credentials: include`，不得把 Token 写入本地存储。

### 6.2 会话返回示例

```json
{
  "user": {
    "userId": "wecom-stable-user-id",
    "name": "张三",
    "avatarUrl": "https://...",
    "departmentIds": [1921805]
  },
  "role": "reader",
  "capabilities": ["diagram:read", "diagram:export", "permission:apply"],
  "writeRequestStatus": "none"
}
```

前端可以使用 `capabilities` 控制交互，但服务器必须独立执行同一规则，不能信任该响应被前端保存后的副本。

## 7. 三种写权限开通流程

### 7.1 管理员邀请

1. 管理员进入“权限管理”，从企微组织树搜索并选择内部成员；
2. 填写邀请说明，可设置 7 天有效期；
3. 系统创建 `pending` 邀请并发送企微通知；
4. 被邀请人进入 BochuPath 后看到邀请条，选择“接受”或“拒绝”；
5. 接受后服务器创建 `editor` 授权，邀请状态变为 `accepted`；
6. 邀请过期、取消或拒绝时不产生写权限。

同一用户只能存在一个有效编辑邀请。已有 `editor/admin` 的用户不能再次被邀请。

### 7.2 用户申请

1. Reader 在图库或只读工作台点击“申请编辑权限”；
2. 对话框展示当前身份，要求填写 10–200 字申请原因；
3. 提交后状态变为“审核中”，重复提交被阻止；
4. Admin 在“权限管理 / 待审批”查看申请人、部门、原因和申请时间；
5. 管理员批准时立即创建 `editor` 授权；拒绝时必须填写原因；
6. 结果通过企微通知，并在用户下次聚焦页面或刷新会话时生效。

申请状态：`pending → approved | rejected | cancelled`。同一用户只有在没有 `pending` 申请时才能重新申请。

### 7.3 管理员直接开通

1. Admin 搜索企业内部成员；
2. 选择角色 `editor` 或 `admin`，填写操作原因；
3. 二次确认后立即生效；
4. 系统通知被授权人并记录操作者、原因和时间。

直接开通不需要用户确认，适用于项目负责人或紧急协作。系统禁止撤销最后一个有效管理员。

## 8. 权限状态与异常处理

- 内部成员首次登录且无授权：`reader`；
- 邀请未接受：仍为 `reader`；
- 申请审核中：仍为 `reader`；
- 授权有效：`editor/admin`；
- 撤销、到期或离职：立即回到 `reader`，如果已不属于企业组织则由 PageDrop 直接阻止进入；
- 编辑过程中权限被撤销：下一次写请求返回 `403 PERMISSION_REVOKED`，本地草稿保留，界面切到只读并提示联系管理员；
- 登录过期：返回 `401 SESSION_EXPIRED`，保存前不得丢弃草稿，重新登录后由用户重试；
- 数据 revision 冲突：返回 `409 PERSISTENCE_CONFLICT`，继续沿用现有冲突和草稿恢复流程。

## 9. 数据模型

```text
UserPrincipal
- userId: string              // 企微稳定 userId，主键
- name: string
- avatarUrl?: string
- departmentIds: string[]
- organizationActive: boolean
- firstSeenAt / lastSeenAt

RoleGrant
- id: string
- userId: string
- role: editor | admin
- status: active | revoked | expired
- source: invitation | application | direct | bootstrap
- sourceId?: string
- grantedBy: string
- grantedAt: datetime
- expiresAt?: datetime
- revokedBy?: string
- revokedAt?: datetime
- reason: string
- version: number

PermissionRequest
- id: string
- applicantUserId: string
- requestedRole: editor
- reason: string
- status: pending | approved | rejected | cancelled
- decidedBy?: string
- decisionReason?: string
- createdAt / decidedAt?

Invitation
- id: string
- inviteeUserId: string
- role: editor | admin
- message?: string
- status: pending | accepted | declined | expired | cancelled
- invitedBy: string
- createdAt / expiresAt / respondedAt?

AuditEvent
- id: string
- actorUserId: string
- action: string
- targetType / targetId
- before?: object
- after?: object
- requestId: string
- ipHash?: string
- createdAt: datetime
```

`RoleGrant`、申请、邀请和审计必须保存在普通用户不可直接写入的服务器存储中。通路图增加 `createdBy`、`updatedBy` 仅用于展示和审计，不参与角色判断。

## 10. API 契约

### 10.1 会话与申请

```text
GET    /api/bochupath/v1/session
GET    /api/bochupath/v1/permission-requests/me
POST   /api/bochupath/v1/permission-requests
DELETE /api/bochupath/v1/permission-requests/{id}
GET    /api/bochupath/v1/invitations/me
POST   /api/bochupath/v1/invitations/{id}/accept
POST   /api/bochupath/v1/invitations/{id}/decline
```

### 10.2 管理端

```text
GET    /api/bochupath/v1/admin/org-users?keyword=
GET    /api/bochupath/v1/admin/permission-requests?status=pending
POST   /api/bochupath/v1/admin/permission-requests/{id}/approve
POST   /api/bochupath/v1/admin/permission-requests/{id}/reject
POST   /api/bochupath/v1/admin/invitations
DELETE /api/bochupath/v1/admin/invitations/{id}
PUT    /api/bochupath/v1/admin/role-grants/{userId}
DELETE /api/bochupath/v1/admin/role-grants/{userId}
GET    /api/bochupath/v1/admin/audit-events
```

### 10.3 通路图数据

```text
GET                 /api/bochupath/v1/diagrams              reader+
GET                 /api/bochupath/v1/diagrams/{id}         reader+
POST                /api/bochupath/v1/diagrams              editor+
PUT  If-Match       /api/bochupath/v1/diagrams/{id}         editor+
DELETE If-Match     /api/bochupath/v1/diagrams/{id}         editor+
```

所有变更接口要求 CSRF Token、幂等键和服务器取得的操作者身份。标准错误：

- `401 SESSION_EXPIRED`：企微会话失效；
- `403 WRITE_PERMISSION_REQUIRED`：当前为 Reader；
- `403 PERMISSION_REVOKED`：会话期间权限被撤销；
- `403 ADMIN_REQUIRED`：非管理员访问权限管理；
- `409 PERSISTENCE_CONFLICT`：数据版本冲突；
- `409 REQUEST_ALREADY_PENDING`：已有待审批申请；
- `409 LAST_ADMIN_PROTECTED`：不能撤销最后一个管理员。

## 11. 前端信息架构与关键 UI

### 11.1 顶栏

右上角增加紧凑身份区：

```text
[只读]  张三 ▾
        ├─ 我的权限：只读
        ├─ 申请编辑权限
        └─ 退出登录
```

Editor 显示“编辑者”，Admin 显示“管理员”并增加“权限管理”。角色用小型 Tag，不使用大卡片。

“退出登录”由 PageDrop 统一会话能力提供；宿主未提供安全退出接口时不显示该菜单项，BochuPath 不得通过删除未知 Cookie 模拟退出。

### 11.2 Reader 状态

- 图库保留搜索、查看和导出；
- 新建、导入、重命名、复制、删除显示为禁用或不出现；
- 打开 `/edit` 时自动进入查看模式，不渲染可提交的 Inspector；
- 顶部显示紧凑提示条：“当前为只读权限，需要修改？申请编辑权限”；
- 已申请时提示条改为：“编辑权限审核中”，按钮不可重复点击；
- 被拒绝后显示管理员原因，并允许重新申请。

### 11.3 申请编辑权限对话框

```text
申请编辑权限
申请人  张三（产品部）
申请原因 *
[请说明需要编辑哪些通路图和使用目的……]

                     [取消] [提交申请]
```

采用 BOCHUI Lite 4px 网格、紧凑表单、品牌蓝主按钮。错误直接显示在字段下方；提交成功后关闭对话框并更新顶部状态，不使用浏览器原生弹窗。

### 11.4 权限管理页

入口仅 Admin 可见，使用桌面工具型表格，不做卡片墙：

```text
权限管理
[待审批 3] [成员权限] [邀请记录] [审计日志]

搜索成员/部门……                         [邀请成员] [直接开通]
姓名     部门       当前角色    来源      状态      操作
张三     产品部     只读        默认      正常      开通编辑
李四     研发部     编辑者      申请      正常      撤销权限
```

审批使用右侧 Drawer 显示申请原因、历史记录和“拒绝 / 批准”。撤销管理员、直接开通 Admin 等高风险操作使用应用内确认对话框，并写明影响对象。

### 11.5 状态与主题

- 品牌蓝只用于选中、焦点、批准和主操作；
- 成功绿色只表示已批准/已生效；
- 警告橙色表示待审批、即将到期；
- 错误红色表示拒绝、会话失效、权限撤销；
- Light/Dark 均使用主题 Token；
- 常用按钮为 32px 高，Dialog/Drawer 使用现有 BOCHUI 层级和短促动效。

## 12. 审计要求

至少记录：

- 登录成功和被组织门禁拒绝；
- 提交、取消、批准、拒绝权限申请；
- 创建、接受、拒绝、取消、过期邀请；
- 直接开通、角色变更、撤销权限；
- 新建、导入、保存、重命名、复制、删除通路图；
- 写入失败、越权写入和 revision 冲突。

审计记录不可由普通用户修改或删除。管理员只读查看；导出和保留周期由企业安全策略决定，建议在线保留不少于 180 天。

## 13. 初始化与迁移

1. 在部署配置中明确填写至少一名初始 Admin 的企微 `userId`，禁止按姓名匹配，禁止自动授予首个登录者；
2. 备份现有 `bochupath-data.json`；
3. 将 Diagram 数据迁入受保护的业务数据服务并保留 revision；
4. 在切换窗口暂停旧共享 JSON 写入；
5. 上线会话、权限和业务 API；
6. Reader 默认只读，Admin/Editor 通过服务器授权；
7. 执行权限、冲突和审计验收后，关闭旧的无鉴权 JSON PUT 路径。

当前 PageDrop 根部门白名单继续保留，它是第一层组织门禁，不替代应用写权限。

## 14. 开发拆分

### 阶段 A：身份和只读基线

- 实现服务器端企微身份解析和 `/session`；
- 初始化 Admin；
- 前端增加 AuthProvider、角色 Tag、只读模式和 401/403 处理；
- 所有写接口默认拒绝 Reader。

### 阶段 B：申请、邀请和管理

- 实现 RoleGrant、PermissionRequest、Invitation、AuditEvent；
- 实现申请对话框和管理页；
- 接入企微通知；
- 增加批准、拒绝、直开、撤销和最后管理员保护。

### 阶段 C：数据迁移与正式切换

- 将共享 JSON Repository 替换为受保护 HTTP Repository；
- 迁移并校验 Diagram 数据；
- 压测并验证 revision 冲突；
- 关闭旧写入口，完成审计验收。

## 15. 验收标准

1. 非“柏楚”组织成员无法加载 BochuPath iframe；
2. 内部成员首次登录默认 Reader，直接访问 `/edit` 也不能提交修改；
3. Reader 即使修改 DOM、调用前端 Store 或直接请求写接口，服务器仍返回 403，数据不变；
4. 邀请接受、申请批准和管理员直开都能产生有效 Editor 权限；
5. 邀请拒绝/过期、申请拒绝/取消都不会产生权限；
6. 管理员撤销后，用户下一次写入立即失败，未保存草稿仍可保留和导出；
7. 所有授权与业务写入都包含可信操作者并出现在审计日志；
8. 不能撤销最后一个有效 Admin；
9. 401、403、409 状态均有 BOCHUI 风格应用内反馈，不白屏、不静默失败；
10. Light/Dark、键盘、焦点管理和 200% 浏览器缩放通过；
11. PageDrop 访问白名单保持为企业根部门，部署过程不得出现公开访问窗口；
12. 自动化测试覆盖 Reader/Editor/Admin 权限矩阵，以及前端绕过尝试。

## 16. 开发前必须确认的部署参数

- 初始 Admin 的准确企微 `userId`；
- 企微通知应用及模板；
- 审计日志保留周期；
- PageDrop 是否提供可信当前用户身份和写 ACL；若不提供，确定 BochuPath 后端域名与企微 OAuth 配置。

这些参数属于部署配置，不得硬编码到前端仓库或提交密钥。
