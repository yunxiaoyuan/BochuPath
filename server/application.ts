import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { isLoopback, validateConfig, type AppConfig } from './config';
import { Store } from './store';
import { DevelopmentIdentityProvider, WecomIdentityProvider, developmentUsers, type IdentityProvider } from './wecom';
import { ApiError, capabilities, type Grant, type Invitation, type Notification, type PermissionRequest, type Principal, type Role, type Session, type User } from './types';
import { createBlankDiagram } from '../src/domain/seed';
import { parseDiagram } from '../src/domain/schema';
import { assertValid } from '../src/domain/rules';
import type { Diagram } from '../src/domain/types';

const BASE = '/api/bochupath/v1';
const SESSION_COOKIE = 'bochupath_session';
const STATE_COOKIE = 'bochupath_oauth_state';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const sameSecret = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
type Result = { status: number; body: unknown };
type Context = { user: User; session: Session; sessionHash: string; role: Role; requestId: string };
interface State { stateHash: string; bindingHash: string; expiresAt: number; returnTo: string }
function textField(body: Record<string, unknown>, field: string, min: number, max: number, optional = false): string {
  const value = body[field];
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new ApiError(400, 'FIELD_INVALID', `${field} 需为 ${min}–${max} 字符的文字`);
  return value.trim();
}
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n\u0000]/.test(value) || value.startsWith('/api/')) return '/diagrams';
  try { const parsed = new URL(value, 'https://bochupath.invalid'); return parsed.origin === 'https://bochupath.invalid' ? parsed.pathname + parsed.search + parsed.hash : '/diagrams'; } catch { return '/diagrams'; }
}
function cookies(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').flatMap((item) => { const index = item.indexOf('='); return index < 0 ? [] : [[item.slice(0, index).trim(), item.slice(index + 1).trim()]]; }));
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json' && Number(req.headers['content-length'] ?? 0) > 0) throw new ApiError(415, 'JSON_REQUIRED', '请求需要 application/json');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 10 * 1024 * 1024) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求超过 10 MB 限制'); chunks.push(Buffer.from(chunk)); }
  if (!size) return {};
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', '请求需要 application/json');
  try { const body: unknown = JSON.parse(Buffer.concat(chunks).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object expected'); return body as Record<string, unknown>; } catch { throw new ApiError(400, 'JSON_INVALID', '请求 JSON 格式无效'); }
}
function validatedDiagram(input: unknown): Diagram {
  try { return assertValid(parseDiagram(input)); } catch { throw new ApiError(400, 'IMPORT_INVALID', '通路图结构、对象引用或领域规则校验失败'); }
}

export function createApplication(config: AppConfig, options: { identityProvider?: IdentityProvider; now?: () => number } = {}) {
  validateConfig(config);
  const now = options.now ?? Date.now;
  const store = new Store(config.dataDirectory, now); store.initialize(config);
  const identity = options.identityProvider ?? (config.mode === 'development' ? new DevelopmentIdentityProvider() : new WecomIdentityProvider(config));
  const rates = new Map<string, { since: number; count: number }>();
  let notificationRunning = false;
  function checkRate(key: string, max: number) {
    const prior = rates.get(key); const record = prior && now() - prior.since < 60_000 ? prior : { since: now(), count: 0 };
    record.count++; rates.set(key, record); if (record.count > max) throw new ApiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后重试');
    if (rates.size > 2000) for (const [id, entry] of rates) if (now() - entry.since > 60_000) rates.delete(id);
  }
  function cookie(name: string, value: string, age: number) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.appOrigin.startsWith('https:') ? '; Secure' : ''}`; }
  function json(res: ServerResponse, result: Result) {
    res.statusCode = result.status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result.body));
  }
  function redirect(res: ServerResponse, location: string) { res.statusCode = 302; res.setHeader('Location', location); res.end(); }
  function checkOrigin(req: IncomingMessage) {
    if (req.headers.origin !== config.appOrigin || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'ORIGIN_REJECTED', '请求来源不受信任，请从 BochuPath 页面重试');
  }
  function requireRole(context: Context, level: 'reader' | 'editor' | 'admin') {
    const currentSession = store.get<Session>('sessions', context.sessionHash);
    if (!currentSession || currentSession.expiresAt <= now()) throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录');
    const user = store.get<User>('users', context.user.userId);
    if (!user?.organizationActive) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '当前身份已不在允许的组织范围内');
    const role = store.role(context.user.userId); context.role = role;
    if (level === 'admin' && role !== 'admin') throw new ApiError(403, 'ADMIN_REQUIRED', '此操作需要管理员权限');
    if (level === 'editor' && role === 'reader') throw new ApiError(403, context.session.roleSeen !== 'reader' ? 'PERMISSION_REVOKED' : 'WRITE_PERMISSION_REQUIRED', '当前没有编辑权限，未保存草稿仍可保留');
  }
  async function verifiedUser(userId: string) {
    try {
      const principal = await identity.getUser(userId);
      if (!principal.organizationActive || principal.userId !== userId) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '当前身份已离开允许的组织');
      return store.upsertUser(principal);
    } catch (error) { if (error instanceof ApiError && error.status === 403) store.deactivate(userId); throw error; }
  }
  async function authenticate(req: IncomingMessage, requestId: string, verifyIdentity = true): Promise<Context> {
    const raw = cookies(req)[SESSION_COOKIE];
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) throw new ApiError(401, 'SESSION_EXPIRED', '请登录 BochuPath');
    const sessionHash = hash(raw); const session = store.get<Session>('sessions', sessionHash);
    if (!session || session.expiresAt <= now()) { store.remove('sessions', sessionHash); throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录'); }
    const user = verifyIdentity ? await verifiedUser(session.userId) : store.get<User>('users', session.userId);
    if (!user || !store.get('sessions', sessionHash)) throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录');
    return { user, session, sessionHash, role: store.role(user.userId), requestId };
  }
  function sessionPayload(context: Context) { return { user: context.user, role: context.role, capabilities: capabilities(context.role), csrfToken: context.session.csrfToken, writeRequestStatus: store.requestStatus(context.user.userId) }; }
  function login(res: ServerResponse, principal: Principal, req: IncomingMessage, requestId: string) {
    if (!principal.organizationActive) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '仅允许企业内部在职成员登录');
    const user = store.upsertUser(principal); const raw = token(); const sessionHash = hash(raw);
    const session: Session = { userId: user.userId, csrfToken: token(), expiresAt: now() + config.sessionHours * 3_600_000, roleSeen: store.role(user.userId) };
    const previous = cookies(req)[SESSION_COOKIE]; if (previous) store.remove('sessions', hash(previous));
    store.put('sessions', sessionHash, session); store.audit(user.userId, 'auth.login', 'user', user.userId, requestId);
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, raw, Math.floor(config.sessionHours * 3600)));
    return sessionPayload({ user, role: session.roleSeen, session, sessionHash, requestId });
  }
  function ensureMutation(req: IncomingMessage, context: Context) {
    checkOrigin(req); const csrf = req.headers['x-csrf-token'];
    if (typeof csrf !== 'string' || !sameSecret(csrf, context.session.csrfToken)) throw new ApiError(403, 'CSRF_REJECTED', '安全校验已失效，请刷新页面后重试');
    const key = req.headers['idempotency-key']; if (typeof key !== 'string' || !/^[a-zA-Z0-9:_-]{8,128}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', '变更请求缺少有效幂等键');
    checkRate(`write:${context.user.userId}`, 180); return key;
  }
  function mutate(req: IncomingMessage, context: Context, body: unknown, key: string, role: 'reader' | 'editor' | 'admin', operation: () => Result): Result {
    return store.transaction(() => {
      requireRole(context, role);
      const id = `${context.user.userId}:${key}`;
      const fingerprint = hash(`${req.method} ${req.url} ${req.headers['if-match'] ?? ''} ${JSON.stringify(body)}`);
      const previous = store.get<{ fingerprint: string; result: Result }>('idempotency', id);
      if (previous) { if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '相同幂等键不能用于不同操作'); return previous.result; }
      const result = operation(); store.put('idempotency', id, { fingerprint, result, createdAt: store.timestamp() }); return result;
    });
  }
  function requestWithUser(request: PermissionRequest) { return { ...request, user: store.get<User>('users', request.applicantUserId) }; }
  function invitationWithUser(invitation: Invitation) { return { ...invitation, user: store.get<User>('users', invitation.inviteeUserId) }; }
  function notice(userId: string, message: string) { store.notify(userId, `${message}\n${config.appOrigin}/access`, config.notificationsEnabled); }
  function grantPermission(context: Context, userId: string, source: Grant['source'], reason: string, sourceId?: string, role: 'editor' | 'admin' = 'editor') {
    const prior = store.get<Grant>('grants', userId); const granted = store.grant(userId, role, source, context.user.userId, reason, sourceId);
    store.audit(context.user.userId, 'role.granted', 'user', userId, context.requestId, prior, granted); notice(userId, `你的 BochuPath 权限已开通为${role === 'admin' ? '管理员' : '编辑者'}。`);
    // A direct/accepted grant resolves outstanding workflow objects in the same transaction.
    for (const request of store.all<PermissionRequest>('requests')) if (request.applicantUserId === userId && request.status === 'pending') {
      const updated = { ...request, status: 'approved' as const, decidedBy: context.user.userId, decidedAt: store.timestamp(), decisionReason: reason };
      store.put('requests', request.id, updated); store.audit(context.user.userId, 'request.approved', 'permissionRequest', request.id, context.requestId, request, updated);
    }
    for (const invitation of store.all<Invitation>('invitations')) if (invitation.inviteeUserId === userId && invitation.status === 'pending' && invitation.id !== sourceId) {
      const updated = { ...invitation, status: 'cancelled' as const, respondedAt: store.timestamp() };
      store.put('invitations', invitation.id, updated); store.audit(context.user.userId, 'invitation.cancelled', 'invitation', invitation.id, context.requestId, invitation, updated);
    }
    return granted;
  }
  function diagramById(id: string) { const diagram = store.get<Diagram>('diagrams', id); if (!diagram) throw new ApiError(404, 'DIAGRAM_NOT_FOUND', '通路图不存在或已删除'); return diagram; }
  function expectedRevision(req: IncomingMessage, diagram: Diagram) {
    const match = req.headers['if-match']; if (typeof match !== 'string' || !/^(?:\d+|"\d+")$/.test(match)) throw new ApiError(428, 'REVISION_REQUIRED', '保存或删除需要当前通路图版本');
    if (Number(match.replaceAll('"', '')) !== diagram.revision) throw new ApiError(409, 'PERSISTENCE_CONFLICT', '共享版本已更新，本地草稿已保留；请刷新后人工合并');
  }
  async function refreshAdministrators() { for (const grant of store.all<Grant>('grants')) if (grant.status === 'active' && grant.role === 'admin') { try { await verifiedUser(grant.userId); } catch (error) { if (!(error instanceof ApiError) || error.status !== 403) throw error; } } }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL, requestId: string) {
    const path = url.pathname.slice(BASE.length); const method = req.method ?? 'GET';
    if (method === 'GET' && path === '/auth/config') return json(res, { status: 200, body: { mode: config.mode, configured: true, loginUrl: `${BASE}/auth/login`, notificationsEnabled: config.notificationsEnabled, ...(config.mode === 'development' ? { developmentUsers } : {}) } });
    if (method === 'GET' && path === '/auth/login') {
      checkRate(`login:${req.socket.remoteAddress}`, 30);
      if (config.mode === 'development') return redirect(res, '/login');
      const state = token(); const binding = token();
      store.put('oauth_states', hash(state), { stateHash: hash(state), bindingHash: hash(binding), expiresAt: now() + 5 * 60_000, returnTo: safeReturnTo(url.searchParams.get('returnTo')) } satisfies State);
      res.setHeader('Set-Cookie', cookie(STATE_COOKIE, binding, 300));
      return redirect(res, identity.authorizationUrl(state, `${config.appOrigin}${BASE}/auth/callback`, /wxwork/i.test(req.headers['user-agent'] ?? '')));
    }
    if (method === 'GET' && path === '/auth/callback') {
      const state = url.searchParams.get('state') ?? ''; const binding = cookies(req)[STATE_COOKIE] ?? '';
      const stateRecord = store.get<State>('oauth_states', hash(state));
      if (!stateRecord || stateRecord.expiresAt <= now() || !sameSecret(stateRecord.bindingHash, hash(binding))) throw new ApiError(401, 'LOGIN_STATE_INVALID', '登录验证已失效，请重新发起登录');
      store.remove('oauth_states', hash(state)); // Consume before any network wait: a callback may only run once.
      const code = url.searchParams.get('code'); if (!code || code.length > 512) throw new ApiError(400, 'LOGIN_CODE_INVALID', '缺少有效登录授权');
      const principal = await identity.exchangeCode(code);
      login(res, principal, req, requestId); res.setHeader('Set-Cookie', [String(res.getHeader('Set-Cookie')), cookie(STATE_COOKIE, '', 0)]);
      return redirect(res, stateRecord.returnTo);
    }
    if (method === 'POST' && ['/auth/dev-login', '/auth/development/login'].includes(path)) {
      if (config.mode !== 'development' || !config.enableDevAuth || config.nodeEnv !== 'development' || !isLoopback(req.socket.remoteAddress ?? '')) throw new ApiError(404, 'NOT_FOUND', '接口不存在');
      checkOrigin(req); checkRate(`login:${req.socket.remoteAddress}`, 30); const body = await readBody(req);
      const userId = textField(body, 'userId', 1, 128);
      if (!developmentUsers.some((user) => user.userId === userId)) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '请选择固定的本地体验身份');
      return json(res, { status: 200, body: login(res, await identity.getUser(userId), req, requestId) });
    }
    const context = await authenticate(req, requestId, !(method === 'POST' && path === '/auth/logout')); const uid = context.user.userId;
    if (path.startsWith('/admin/')) requireRole(context, 'admin');
    // Expiration must persist even if the subsequent mutation is rejected.
    store.transaction(() => store.expireInvitations());
    if (method === 'GET') {
      if (path === '/session') { context.session.roleSeen = context.role; store.put('sessions', context.sessionHash, context.session); return json(res, { status: 200, body: sessionPayload(context) }); }
      if (path === '/diagrams') return json(res, { status: 200, body: store.diagrams().map((diagram) => ({ id: diagram.id, name: diagram.name, description: diagram.description, revision: diagram.revision, updatedAt: diagram.updatedAt, nodeCount: diagram.nodes.length, pathwayCount: diagram.pathways.length })) });
      if (/^\/diagrams\/[^/]+$/.test(path)) { const diagram = diagramById(decodeURIComponent(path.split('/')[2])); res.setHeader('ETag', `"${diagram.revision}"`); return json(res, { status: 200, body: diagram }); }
      if (path === '/permission-requests/me') return json(res, { status: 200, body: store.all<PermissionRequest>('requests').filter((item) => item.applicantUserId === uid).map(requestWithUser) });
      if (path === '/invitations/me') return json(res, { status: 200, body: store.all<Invitation>('invitations').filter((item) => item.inviteeUserId === uid).map(invitationWithUser) });
      if (path === '/admin/members') return json(res, { status: 200, body: store.all<User>('users').map((user) => ({ user, role: user.organizationActive ? store.role(user.userId) : 'reader', grant: store.get<Grant>('grants', user.userId) })) });
      if (path === '/admin/org-users') { const keyword = url.searchParams.get('keyword') ?? ''; if (keyword.length > 100) throw new ApiError(400, 'FIELD_INVALID', '搜索关键词过长'); const users = await identity.searchUsers(keyword); requireRole(context, 'admin'); users.forEach((user) => store.upsertUser(user)); return json(res, { status: 200, body: users }); }
      if (path === '/admin/permission-requests') return json(res, { status: 200, body: store.all<PermissionRequest>('requests').filter((item) => !url.searchParams.get('status') || item.status === url.searchParams.get('status')).map(requestWithUser) });
      if (path === '/admin/invitations') return json(res, { status: 200, body: store.all<Invitation>('invitations').map(invitationWithUser) });
      if (path === '/admin/audit-events') return json(res, { status: 200, body: store.audits() });
      if (path === '/admin/notifications') return json(res, { status: 200, body: store.all<Notification>('notifications').slice(0, 500) });
      throw new ApiError(404, 'NOT_FOUND', '接口不存在');
    }
    const key = ensureMutation(req, context); const body = await readBody(req);
    let result: Result;
    if (method === 'POST' && path === '/auth/logout') {
      result = mutate(req, context, body, key, 'reader', () => { store.remove('sessions', context.sessionHash); store.audit(uid, 'auth.logout', 'user', uid, requestId); return { status: 200, body: { ok: true } }; });
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0)); return json(res, result);
    }
    if (path.startsWith('/diagrams')) result = mutate(req, context, body, key, 'editor', () => {
      if (method === 'POST' && path === '/diagrams') { const diagram = createBlankDiagram(textField(body, 'name', 1, 80)); diagram.description = textField(body, 'description', 0, 10000, true); diagram.createdAt = diagram.updatedAt = store.timestamp(); diagram.revision = 1; store.put('diagrams', diagram.id, diagram); store.audit(uid, 'diagram.created', 'diagram', diagram.id, requestId, undefined, { name: diagram.name, revision: diagram.revision }); return { status: 201, body: diagram }; }
      if (method === 'POST' && path === '/diagrams/import') { const diagram = validatedDiagram(body.diagram); diagram.id = `diagram_${randomUUID()}`; diagram.revision = 1; diagram.createdAt = diagram.updatedAt = store.timestamp(); store.put('diagrams', diagram.id, diagram); store.audit(uid, 'diagram.imported', 'diagram', diagram.id, requestId, undefined, { name: diagram.name, revision: 1 }); return { status: 201, body: diagram }; }
      const match = path.match(/^\/diagrams\/([^/]+)(\/duplicate)?$/); if (!match) throw new ApiError(404, 'NOT_FOUND', '接口不存在');
      const existing = diagramById(decodeURIComponent(match[1]));
      if (method === 'POST' && match[2]) { const copy = { ...existing, id: `diagram_${randomUUID()}`, name: textField(body, 'name', 1, 80), revision: 1, createdAt: store.timestamp(), updatedAt: store.timestamp() }; store.put('diagrams', copy.id, copy); store.audit(uid, 'diagram.duplicated', 'diagram', copy.id, requestId, { sourceId: existing.id }, { name: copy.name }); return { status: 201, body: copy }; }
      if (match[2]) throw new ApiError(405, 'METHOD_NOT_ALLOWED', '操作方法不支持');
      expectedRevision(req, existing);
      if (method === 'PUT') { const diagram = validatedDiagram(body); if (diagram.id !== existing.id || diagram.revision !== existing.revision) throw new ApiError(409, 'PERSISTENCE_CONFLICT', '图标识或版本与服务器不一致'); diagram.revision = existing.revision + 1; diagram.createdAt = existing.createdAt; diagram.updatedAt = store.timestamp(); store.put('diagrams', diagram.id, diagram); store.audit(uid, 'diagram.saved', 'diagram', diagram.id, requestId, { name: existing.name, revision: existing.revision }, { name: diagram.name, revision: diagram.revision }); return { status: 200, body: diagram }; }
      if (method === 'DELETE') { store.remove('diagrams', existing.id); store.audit(uid, 'diagram.deleted', 'diagram', existing.id, requestId, { name: existing.name, revision: existing.revision }); return { status: 200, body: { ok: true } }; }
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', '操作方法不支持');
    });
    else if (method === 'POST' && path === '/permission-requests') result = mutate(req, context, body, key, 'reader', () => {
      if (store.role(uid) !== 'reader') throw new ApiError(409, 'WRITE_PERMISSION_EXISTS', '你已拥有编辑权限，无需申请');
      if (store.all<PermissionRequest>('requests').some((item) => item.applicantUserId === uid && item.status === 'pending')) throw new ApiError(409, 'REQUEST_ALREADY_PENDING', '已有待审批的编辑权限申请');
      const request: PermissionRequest = { id: randomUUID(), applicantUserId: uid, requestedRole: 'editor', reason: textField(body, 'reason', 10, 200), status: 'pending', createdAt: store.timestamp() };
      store.put('requests', request.id, request); store.audit(uid, 'request.created', 'permissionRequest', request.id, requestId, undefined, request);
      for (const grant of store.all<Grant>('grants')) if (grant.status === 'active' && grant.role === 'admin') notice(grant.userId, `${context.user.name} 提交了 BochuPath 编辑权限申请。`);
      return { status: 201, body: requestWithUser(request) };
    });
    else if (method === 'DELETE' && /^\/permission-requests\/[^/]+$/.test(path)) result = mutate(req, context, body, key, 'reader', () => {
      const request = store.get<PermissionRequest>('requests', decodeURIComponent(path.split('/')[2])); if (!request || request.applicantUserId !== uid) throw new ApiError(404, 'REQUEST_NOT_FOUND', '申请不存在');
      if (request.status !== 'pending') throw new ApiError(409, 'REQUEST_ALREADY_DECIDED', '申请已经处理，不能取消');
      const updated = { ...request, status: 'cancelled' as const, decidedAt: store.timestamp(), decidedBy: uid }; store.put('requests', request.id, updated); store.audit(uid, 'request.cancelled', 'permissionRequest', request.id, requestId, request, updated); return { status: 200, body: requestWithUser(updated) };
    });
    else if (method === 'POST' && /^\/invitations\/[^/]+\/(accept|decline)$/.test(path)) result = mutate(req, context, body, key, 'reader', () => {
      const invitation = store.get<Invitation>('invitations', decodeURIComponent(path.split('/')[2])); if (!invitation || invitation.inviteeUserId !== uid) throw new ApiError(404, 'INVITATION_NOT_FOUND', '邀请不存在');
      if (Date.parse(invitation.expiresAt) <= now()) throw new ApiError(409, 'INVITATION_EXPIRED', '邀请已经过期，请联系管理员重新邀请');
      if (invitation.status !== 'pending') throw new ApiError(409, 'INVITATION_ALREADY_HANDLED', '邀请已经处理');
      const accepted = path.endsWith('/accept'); if (accepted && store.role(uid) !== 'reader') throw new ApiError(409, 'WRITE_PERMISSION_EXISTS', '你已拥有编辑权限');
      const updated: Invitation = { ...invitation, status: accepted ? 'accepted' : 'declined', respondedAt: store.timestamp() }; store.put('invitations', invitation.id, updated);
      if (accepted) grantPermission(context, uid, 'invitation', invitation.message || '接受管理员邀请', invitation.id);
      store.audit(uid, `invitation.${updated.status}`, 'invitation', invitation.id, requestId, invitation, updated); return { status: 200, body: invitationWithUser(updated) };
    });
    else if (path.startsWith('/admin/')) result = await adminMutation(req, path, context, body, key);
    else throw new ApiError(404, 'NOT_FOUND', '接口不存在');
    json(res, result);
  }

  async function adminMutation(req: IncomingMessage, path: string, context: Context, body: Record<string, unknown>, key: string): Promise<Result> {
    const method = req.method; const uid = context.user.userId; const requestId = context.requestId;
    // Network identity verification precedes the transaction. Actor authorization is rechecked inside it.
    if (method === 'POST' && path === '/admin/invitations') await verifiedUser(textField(body, 'inviteeUserId', 1, 128));
    const roleMatch = path.match(/^\/admin\/role-grants\/([^/]+)$/);
    if (roleMatch) {
      const target = decodeURIComponent(roleMatch[1]);
      if (method === 'PUT') await verifiedUser(target);
      // Revocation remains available after the target leaves. Only self-removal
      // requires fresh checks of other administrators for last-admin protection.
      if (target === uid && store.role(uid) === 'admin' && (method === 'DELETE' || body.role === 'editor')) await refreshAdministrators();
    }
    const approvalMatch = path.match(/^\/admin\/permission-requests\/([^/]+)\/(approve|reject)$/);
    if (approvalMatch && approvalMatch[2] === 'approve') { const request = store.get<PermissionRequest>('requests', decodeURIComponent(approvalMatch[1])); if (request) await verifiedUser(request.applicantUserId); }
    return mutate(req, context, body, key, 'admin', () => {
      store.expireInvitations();
      if (method === 'POST' && path === '/admin/invitations') {
        const inviteeUserId = textField(body, 'inviteeUserId', 1, 128);
        if (store.role(inviteeUserId) !== 'reader') throw new ApiError(409, 'WRITE_PERMISSION_EXISTS', '该成员已拥有编辑权限');
        if (store.all<Invitation>('invitations').some((item) => item.inviteeUserId === inviteeUserId && item.status === 'pending')) throw new ApiError(409, 'INVITATION_ALREADY_PENDING', '该成员已有有效邀请');
        const days = body.expiresInDays ?? 7; if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 30) throw new ApiError(400, 'FIELD_INVALID', '邀请有效期需要 1–30 天');
        const invitation: Invitation = { id: randomUUID(), inviteeUserId, role: 'editor', message: textField(body, 'message', 0, 200, true), status: 'pending', invitedBy: uid, createdAt: store.timestamp(), expiresAt: new Date(now() + days * 86_400_000).toISOString() };
        store.put('invitations', invitation.id, invitation); store.audit(uid, 'invitation.created', 'invitation', invitation.id, requestId, undefined, invitation); notice(inviteeUserId, `${context.user.name} 邀请你成为 BochuPath 编辑者，请登录接受或拒绝。`); return { status: 201, body: invitationWithUser(invitation) };
      }
      if (method === 'DELETE' && /^\/admin\/invitations\/[^/]+$/.test(path)) {
        const invitation = store.get<Invitation>('invitations', decodeURIComponent(path.split('/')[3])); if (!invitation) throw new ApiError(404, 'INVITATION_NOT_FOUND', '邀请不存在');
        if (invitation.status !== 'pending') throw new ApiError(409, 'INVITATION_ALREADY_HANDLED', '邀请已经处理');
        const updated: Invitation = { ...invitation, status: 'cancelled', respondedAt: store.timestamp() }; store.put('invitations', invitation.id, updated); store.audit(uid, 'invitation.cancelled', 'invitation', invitation.id, requestId, invitation, updated); return { status: 200, body: invitationWithUser(updated) };
      }
      if (method === 'POST' && approvalMatch) {
        const request = store.get<PermissionRequest>('requests', decodeURIComponent(approvalMatch[1])); if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', '申请不存在');
        if (request.status !== 'pending') throw new ApiError(409, 'REQUEST_ALREADY_DECIDED', '申请已经被处理');
        const approve = approvalMatch[2] === 'approve'; const reason = textField(body, 'reason', approve ? 0 : 1, 200, approve) || '管理员批准申请';
        const updated: PermissionRequest = { ...request, status: approve ? 'approved' : 'rejected', decidedAt: store.timestamp(), decidedBy: uid, decisionReason: reason };
        store.put('requests', request.id, updated); if (approve) { if (store.role(request.applicantUserId) !== 'reader') throw new ApiError(409, 'WRITE_PERMISSION_EXISTS', '该成员已拥有编辑权限'); grantPermission(context, request.applicantUserId, 'application', reason, request.id); } else notice(request.applicantUserId, `你的 BochuPath 编辑权限申请被拒绝：${reason}`);
        store.audit(uid, `request.${updated.status}`, 'permissionRequest', request.id, requestId, request, updated); return { status: 200, body: requestWithUser(updated) };
      }
      if (roleMatch) {
        const userId = decodeURIComponent(roleMatch[1]); const reason = textField(body, 'reason', 1, 200); const previous = store.get<Grant>('grants', userId);
        if (method === 'PUT') { if (body.role !== 'editor' && body.role !== 'admin') throw new ApiError(400, 'FIELD_INVALID', '只能开通 editor 或 admin 角色'); if (body.role !== 'admin') store.protectLastAdmin(userId); const grant = grantPermission(context, userId, 'direct', reason, undefined, body.role); return { status: 200, body: { user: store.get<User>('users', userId), role: body.role, grant } }; }
        if (method === 'DELETE') { if (!previous || previous.status !== 'active') throw new ApiError(409, 'ROLE_NOT_GRANTED', '该成员没有可撤销的授权'); store.protectLastAdmin(userId); const revoked: Grant = { ...previous, status: 'revoked', revokedBy: uid, revokedAt: store.timestamp(), reason, version: previous.version + 1 }; store.put('grants', userId, revoked); store.audit(uid, 'role.revoked', 'user', userId, requestId, previous, revoked); notice(userId, `你的 BochuPath 编辑权限已撤销：${reason}`); return { status: 200, body: { user: store.get<User>('users', userId), role: 'reader', grant: revoked } }; }
      }
      const notificationMatch = path.match(/^\/admin\/notifications\/([^/]+)\/retry$/);
      if (method === 'POST' && notificationMatch) { const entry = store.get<Notification>('notifications', decodeURIComponent(notificationMatch[1])); if (!entry) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在'); if (!config.notificationsEnabled) throw new ApiError(409, 'NOTIFICATIONS_DISABLED', '部署尚未启用企业微信通知'); if (entry.status !== 'failed' && entry.status !== 'disabled') throw new ApiError(409, 'NOTIFICATION_ALREADY_HANDLED', '只有失败或未启用的通知可以重试'); const updated = { ...entry, status: 'pending' as const, lastError: undefined }; store.put('notifications', entry.id, updated); store.audit(uid, 'notification.retry', 'notification', entry.id, requestId); return { status: 200, body: updated }; }
      throw new ApiError(404, 'NOT_FOUND', '接口不存在');
    });
  }

  async function staticFile(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(404, 'NOT_FOUND', '接口不存在');
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('\\') || decoded.split('/').some((part) => part.startsWith('.')) || decoded.includes('\0') || /\.json(?:$|\/)/i.test(decoded) || decoded.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND', '资源不存在');
    const root = await realpath(config.distDirectory).catch(() => ''); if (!root) throw new ApiError(503, 'FRONTEND_NOT_BUILT', '前端尚未构建，请使用开发服务器或先完成构建');
    const requested = resolve(root, `.${decoded}`); if (requested !== root && !requested.startsWith(root + sep)) throw new ApiError(404, 'NOT_FOUND', '资源不存在');
    const extensions: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
    let file = requested; let extension = extname(file);
    if (!extension) { file = resolve(root, 'index.html'); extension = '.html'; }
    if (!extensions[extension]) throw new ApiError(404, 'NOT_FOUND', '资源不存在');
    const real = await realpath(file).catch(() => ''); if (!real || !real.startsWith(root + sep) || !(await stat(real)).isFile()) throw new ApiError(404, 'NOT_FOUND', '资源不存在');
    res.setHeader('Content-Type', extensions[extension]); res.setHeader('Cache-Control', extension === '.html' ? 'no-store' : 'public, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';");
    res.end(req.method === 'HEAD' ? undefined : await readFile(real));
  }
  async function flushNotifications() {
    if (notificationRunning || !config.notificationsEnabled) return; notificationRunning = true;
    try { for (const entry of store.all<Notification>('notifications').filter((item) => item.status === 'pending').slice(0, 20)) {
      try { await identity.sendNotification(entry.userId, entry.text); store.put('notifications', entry.id, { ...entry, status: 'sent', attempts: entry.attempts + 1, sentAt: store.timestamp(), lastError: undefined }); }
      catch (error) { store.put('notifications', entry.id, { ...entry, status: 'failed', attempts: entry.attempts + 1, lastError: error instanceof ApiError ? error.message : '企业微信通知未送达，请稍后重试' }); }
    } } finally { notificationRunning = false; }
  }
  const server = createServer(async (req, res) => {
    const requestId = randomUUID(); res.setHeader('X-Request-Id', requestId); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const url = new URL(req.url ?? '/', config.appOrigin);
      const expectedHost = new URL(config.appOrigin).host;
      if (req.headers.host !== expectedHost && !(config.mode === 'development' && [config.host + ':' + config.port, '[::1]:' + config.port].includes(req.headers.host ?? ''))) throw new ApiError(403, 'HOST_REJECTED', '请求域名不受信任');
      if (url.pathname === '/health') return json(res, { status: 200, body: { ok: true } });
      if (url.pathname.startsWith(BASE + '/')) await api(req, res, url, requestId); else await staticFile(req, res, url.pathname);
    } catch (error) {
      const known = error instanceof ApiError ? error : error instanceof URIError ? new ApiError(400, 'PATH_INVALID', '请求路径格式无效') : new ApiError(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试');
      try { const session = store.get<Session>('sessions', hash(cookies(req)[SESSION_COOKIE] ?? '')); store.audit(session?.userId ?? 'anonymous', `request.failed.${known.code}`, 'http', (req.url ?? '/').split('?')[0], requestId, undefined, { status: known.status }); } catch { /* A storage failure must not leak details or turn a denial into success. */ }
      if (!res.headersSent && req.method === 'GET' && (req.url ?? '').split('?')[0] === BASE + '/auth/callback') {
        res.setHeader('Set-Cookie', cookie(STATE_COOKIE, '', 0));
        redirect(res, `/login?auth_error=${encodeURIComponent(known.code)}`);
      } else if (!res.headersSent) json(res, { status: known.status, body: { error: { code: known.code, message: known.message } } }); else res.end();
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
  const timer = setInterval(() => { void flushNotifications().catch(() => undefined); }, 5000); timer.unref();
  function close() { clearInterval(timer); server.close(); store.close(); }
  return { server, store, identity, flushNotifications, close };
}
