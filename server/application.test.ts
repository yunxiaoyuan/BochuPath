import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApplication } from './application';
import type { AppConfig } from './config';

const BASE = '/api/bochupath/v1';

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve, reject) => probe.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function fixture(now: () => number = Date.now) {
  const port = await freePort();
  const directory = mkdtempSync(join(tmpdir(), 'bochupath-server-test-'));
  const config: AppConfig = {
    mode: 'development', nodeEnv: 'development', enableDevAuth: true,
    host: '127.0.0.1', port, appOrigin: `http://127.0.0.1:${port}`,
    dataDirectory: directory, distDirectory: join(directory, 'dist'), initialAdminIds: [],
    corpId: '', agentId: '', appSecret: '', rootDepartmentIds: [], sessionHours: 8,
    notificationsEnabled: false,
  };
  const application = createApplication(config, { now });
  await new Promise<void>((resolve, reject) => application.server.listen(port, config.host, resolve).once('error', reject));
  return {
    config,
    application,
    close: async () => {
      await new Promise<void>((resolve) => application.server.close(() => resolve()));
      application.store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

class Client {
  cookie = '';
  csrf = '';
  constructor(private origin: string) {}
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('Cookie', this.cookie);
    const response = await fetch(`${this.origin}${BASE}${path}`, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0] ?? '';
    return response;
  }
  async login(userId: 'dev-reader' | 'dev-editor' | 'dev-admin') {
    const response = await this.request('/auth/dev-login', {
      method: 'POST', headers: { Origin: this.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { csrfToken: string };
    this.csrf = body.csrfToken;
    return body;
  }
  async session() {
    const response = await this.request('/session');
    assert.equal(response.status, 200);
    const body = await response.json() as { csrfToken: string; role: string };
    this.csrf = body.csrfToken;
    return body;
  }
  mutate(path: string, method: string, body: unknown = {}, extra: Record<string, string> = {}) {
    return this.request(path, {
      method,
      headers: {
        Origin: this.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf,
        'Idempotency-Key': crypto.randomUUID(), ...extra,
      },
      body: JSON.stringify(body),
    });
  }
}

test('server is closed by default and enforces reader/editor/revocation roles', async () => {
  const run = await fixture();
  try {
    const anonymous = new Client(run.config.appOrigin);
    assert.equal((await anonymous.request('/diagrams')).status, 401);

    const reader = new Client(run.config.appOrigin);
    const admin = new Client(run.config.appOrigin);
    await reader.login('dev-reader');
    await admin.login('dev-admin');
    const denied = await reader.mutate('/diagrams', 'POST', { name: '不应创建' });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json() as { error: { code: string } }).error.code, 'WRITE_PERMISSION_REQUIRED');
    assert.equal((await reader.request('/admin/members')).status, 403);

    const grant = await admin.mutate('/admin/role-grants/dev-reader', 'PUT', { role: 'editor', reason: '服务端权限验收' });
    assert.equal(grant.status, 200);
    assert.equal((await reader.session()).role, 'editor');
    const created = await reader.mutate('/diagrams', 'POST', { name: '权限测试图' });
    assert.equal(created.status, 201);

    const revoked = await admin.mutate('/admin/role-grants/dev-reader', 'DELETE', { reason: '验证撤权即时生效' });
    assert.equal(revoked.status, 200);
    const deniedAfterRevoke = await reader.mutate('/diagrams', 'POST', { name: '撤权后不应创建' });
    assert.equal(deniedAfterRevoke.status, 403);
    assert.equal((await deniedAfterRevoke.json() as { error: { code: string } }).error.code, 'PERMISSION_REVOKED');
  } finally { await run.close(); }
});

test('mutations require trusted origin, csrf and unique idempotency semantics', async () => {
  const run = await fixture();
  try {
    const editor = new Client(run.config.appOrigin);
    await editor.login('dev-editor');
    const noOrigin = await editor.request('/diagrams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '拒绝' }) });
    assert.equal(noOrigin.status, 403);
    const malformedMultibyteCsrf = await editor.request('/diagrams', {
      method: 'POST', headers: { Origin: run.config.appOrigin, 'Content-Type': 'application/json', 'X-CSRF-Token': 'é', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ name: '拒绝' }),
    });
    assert.equal(malformedMultibyteCsrf.status, 403);
    assert.notEqual((await malformedMultibyteCsrf.json() as { error: { code: string } }).error.code, 'INTERNAL_ERROR');

    const key = crypto.randomUUID();
    const headers = { 'Idempotency-Key': key };
    const first = await editor.mutate('/diagrams', 'POST', { name: '幂等图' }, headers);
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { id: string };
    const replay = await editor.mutate('/diagrams', 'POST', { name: '幂等图' }, headers);
    assert.equal(replay.status, 201);
    assert.equal((await replay.json() as { id: string }).id, firstBody.id);
    const conflict = await editor.mutate('/diagrams', 'POST', { name: '换了请求内容' }, headers);
    assert.equal(conflict.status, 409);
  } finally { await run.close(); }
});

test('optimistic revisions protect shared diagrams and the last administrator cannot be removed', async () => {
  const run = await fixture();
  try {
    const admin = new Client(run.config.appOrigin);
    await admin.login('dev-admin');
    const created = await admin.mutate('/diagrams', 'POST', { name: '版本测试图' });
    const diagram = await created.json() as Record<string, unknown> & { id: string; revision: number };
    const missingVersion = await admin.mutate(`/diagrams/${diagram.id}`, 'PUT', diagram);
    assert.equal(missingVersion.status, 428);
    const saved = await admin.mutate(`/diagrams/${diagram.id}`, 'PUT', diagram, { 'If-Match': String(diagram.revision) });
    assert.equal(saved.status, 200);
    const stale = await admin.mutate(`/diagrams/${diagram.id}`, 'PUT', diagram, { 'If-Match': String(diagram.revision) });
    assert.equal(stale.status, 409);

    const lastAdmin = await admin.mutate('/admin/role-grants/dev-admin', 'DELETE', { reason: '验证最后管理员保护' });
    assert.equal(lastAdmin.status, 409);
    assert.equal((await lastAdmin.json() as { error: { code: string } }).error.code, 'LAST_ADMIN_PROTECTED');
  } finally { await run.close(); }
});

test('expired invitations persist as expired and cannot be accepted', async () => {
  let clock = Date.parse('2026-09-09T00:00:00.000Z');
  const run = await fixture(() => clock);
  try {
    const admin = new Client(run.config.appOrigin);
    const reader = new Client(run.config.appOrigin);
    await admin.login('dev-admin');
    await reader.login('dev-reader');
    const invited = await admin.mutate('/admin/invitations', 'POST', { inviteeUserId: 'dev-reader', message: '过期测试', expiresInDays: 1 });
    assert.equal(invited.status, 201);
    const invitation = await invited.json() as { id: string };
    clock += 2 * 86_400_000;
    await reader.login('dev-reader');
    const accepted = await reader.mutate(`/invitations/${invitation.id}/accept`, 'POST');
    assert.equal(accepted.status, 409);
    assert.equal((await accepted.json() as { error: { code: string } }).error.code, 'INVITATION_EXPIRED');
    const mine = await reader.request('/invitations/me');
    const invitations = await mine.json() as { id: string; status: string }[];
    assert.equal(invitations.find((item) => item.id === invitation.id)?.status, 'expired');
  } finally { await run.close(); }
});
