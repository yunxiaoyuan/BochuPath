import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config';
import { ApiError, type Audit, type Grant, type Invitation, type Notification, type PermissionRequest, type Principal, type Role, type Session, type User } from './types';
import { developmentUsers } from './wecom';
import type { Diagram } from '../src/domain/types';

type Table = 'users' | 'grants' | 'requests' | 'invitations' | 'diagrams' | 'sessions' | 'oauth_states' | 'idempotency' | 'notifications' | 'metadata';
export class Store {
  readonly db: DatabaseSync;
  constructor(directory: string, private now: () => number = Date.now) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'bochupath.sqlite'); this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    for (const table of ['users', 'grants', 'requests', 'invitations', 'diagrams', 'sessions', 'oauth_states', 'idempotency', 'notifications', 'metadata']) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;`);
  }
  timestamp() { return new Date(this.now()).toISOString(); }
  get<T>(table: Table, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as T : undefined; }
  all<T>(table: Table): T[] { return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as { data: string }[]).map((row) => JSON.parse(row.data) as T); }
  put(table: Table, id: string, data: unknown) { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id, JSON.stringify(data)); }
  remove(table: Table, id: string) { this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); }
  transaction<T>(callback: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = callback(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  initialize(config: AppConfig) {
    this.transaction(() => {
      const marker = this.get<{ mode: string }>('metadata', 'auth-mode');
      if (marker && marker.mode !== config.mode) throw new Error('Development and production authentication must use separate databases');
      this.put('metadata', 'auth-mode', { mode: config.mode });
      if (this.get('metadata', 'bootstrap-complete')) return;
      if (config.mode === 'development') {
        for (const user of developmentUsers) {
          this.upsertUser({ userId: user.userId, name: user.name, departmentIds: ['development'], organizationActive: true });
          if (user.role !== 'reader') this.grant(user.userId, user.role, 'bootstrap', 'system', '固定本地体验身份');
        }
      } else for (const userId of config.initialAdminIds) {
        this.upsertUser({ userId, name: userId, departmentIds: [], organizationActive: false });
        this.grant(userId, 'admin', 'bootstrap', 'system', '部署配置指定初始管理员');
      }
      this.put('metadata', 'bootstrap-complete', { at: this.timestamp() });
    });
  }
  upsertUser(principal: Principal): User {
    const existing = this.get<User>('users', principal.userId);
    const user = { ...principal, firstSeenAt: existing?.firstSeenAt ?? this.timestamp(), lastSeenAt: this.timestamp() };
    this.put('users', user.userId, user); return user;
  }
  deactivate(userId: string) {
    this.transaction(() => {
      const user = this.get<User>('users', userId); if (user) this.put('users', userId, { ...user, organizationActive: false });
      const grant = this.get<Grant>('grants', userId);
      if (grant?.status === 'active') {
        const revoked: Grant = { ...grant, status: 'revoked', revokedBy: 'system', revokedAt: this.timestamp(), reason: '企业微信确认成员已离开允许的组织范围', version: grant.version + 1 };
        this.put('grants', userId, revoked); this.audit('system', 'role.organization-revoked', 'user', userId, randomUUID(), grant, revoked);
      }
      for (const row of this.db.prepare('SELECT id,data FROM sessions').all() as { id: string; data: string }[]) if ((JSON.parse(row.data) as Session).userId === userId) this.remove('sessions', row.id);
    });
  }
  role(userId: string): Role { const grant = this.get<Grant>('grants', userId); return grant?.status === 'active' ? grant.role : 'reader'; }
  grant(userId: string, role: 'editor' | 'admin', source: Grant['source'], actor: string, reason: string, sourceId?: string): Grant {
    const prior = this.get<Grant>('grants', userId);
    const grant: Grant = { id: prior?.id ?? randomUUID(), userId, role, status: 'active', source, sourceId, grantedBy: actor, grantedAt: this.timestamp(), reason, version: (prior?.version ?? 0) + 1 };
    this.put('grants', userId, grant); return grant;
  }
  protectLastAdmin(userId: string) {
    if (this.role(userId) !== 'admin') return;
    const others = this.all<Grant>('grants').filter((grant) => grant.userId !== userId && grant.status === 'active' && grant.role === 'admin' && this.get<User>('users', grant.userId)?.organizationActive);
    if (!others.length) throw new ApiError(409, 'LAST_ADMIN_PROTECTED', '不能撤销或降级最后一名有效管理员');
  }
  audit(actorUserId: string, action: string, targetType: string, targetId: string, requestId: string, before?: unknown, after?: unknown) {
    const event: Audit = { id: randomUUID(), actorUserId, action, targetType, targetId, requestId, createdAt: this.timestamp(), before, after };
    this.db.prepare('INSERT INTO audit(id,data) VALUES(?,?)').run(event.id, JSON.stringify(event)); return event;
  }
  audits(limit = 500): Audit[] { return (this.db.prepare('SELECT data FROM audit ORDER BY sequence DESC LIMIT ?').all(limit) as { data: string }[]).map((row) => JSON.parse(row.data) as Audit); }
  notify(userId: string, text: string, enabled: boolean) {
    const record: Notification = { id: randomUUID(), userId, text, status: enabled ? 'pending' : 'disabled', attempts: 0, createdAt: this.timestamp(), ...(!enabled ? { lastError: '部署未启用企微通知，结果已在应用内显示' } : {}) };
    this.put('notifications', record.id, record); return record;
  }
  expireInvitations() {
    for (const invitation of this.all<Invitation>('invitations')) if (invitation.status === 'pending' && Date.parse(invitation.expiresAt) <= this.now()) {
      this.put('invitations', invitation.id, { ...invitation, status: 'expired', respondedAt: this.timestamp() });
      this.audit('system', 'invitation.expired', 'invitation', invitation.id, randomUUID(), invitation, { status: 'expired' });
    }
  }
  requestStatus(userId: string) { return this.all<PermissionRequest>('requests').filter((request) => request.applicantUserId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.status ?? 'none'; }
  diagrams(): Diagram[] { return this.all<Diagram>('diagrams'); }
  close() { this.db.close(); }
}
