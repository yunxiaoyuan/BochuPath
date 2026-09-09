import type { AppConfig } from './config';
import { ApiError, type Principal } from './types';

export interface IdentityProvider {
  authorizationUrl(state: string, callbackUrl: string, inWecom: boolean): string;
  exchangeCode(code: string): Promise<Principal>;
  getUser(userId: string): Promise<Principal>;
  searchUsers(keyword: string): Promise<Principal[]>;
  sendNotification(userId: string, text: string): Promise<void>;
}
export const developmentUsers = [
  { userId: 'dev-reader', name: '只读体验员', role: 'reader' as const },
  { userId: 'dev-editor', name: '编辑体验员', role: 'editor' as const },
  { userId: 'dev-admin', name: '管理员体验员', role: 'admin' as const },
];
export class DevelopmentIdentityProvider implements IdentityProvider {
  authorizationUrl() { return '/login'; }
  async exchangeCode(): Promise<Principal> { throw new ApiError(400, 'LOGIN_DISABLED', '本地体验请从登录页面选择体验身份'); }
  async getUser(userId: string): Promise<Principal> {
    const user = developmentUsers.find((item) => item.userId === userId);
    if (!user) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '身份不在本地体验名单中');
    return { userId, name: user.name, departmentIds: ['development'], organizationActive: true };
  }
  async searchUsers(keyword: string) { return Promise.all(developmentUsers.filter((user) => `${user.name} ${user.userId}`.toLowerCase().includes(keyword.toLowerCase())).map((user) => this.getUser(user.userId))); }
  async sendNotification() { throw new ApiError(503, 'NOTIFICATIONS_DISABLED', '本地体验不发送企业微信通知'); }
}

/** Official APIs verified 2026-09-07: documents 98152, 98176, 91022, 91039, 90196, 90201, 90208, 90236. */
export class WecomIdentityProvider implements IdentityProvider {
  private token: { value: string; expiresAt: number } | undefined;
  private tokenRequest: Promise<string> | undefined;
  constructor(private config: AppConfig, private fetcher: typeof fetch = fetch) {}
  authorizationUrl(state: string, callbackUrl: string, inWecom: boolean) {
    const url = new URL(inWecom ? 'https://open.weixin.qq.com/connect/oauth2/authorize' : 'https://login.work.weixin.qq.com/wwlogin/sso/login');
    url.search = new URLSearchParams({ appid: this.config.corpId, agentid: this.config.agentId, redirect_uri: callbackUrl, state,
      ...(inWecom ? { response_type: 'code', scope: 'snsapi_base' } : { login_type: 'CorpApp' }) }).toString();
    if (inWecom) url.hash = 'wechat_redirect'; return url.href;
  }
  private async json(url: URL, init?: RequestInit): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetcher(url, { ...init, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('upstream');
      const data = await response.json() as Record<string, unknown>;
      if (Number(data.errcode ?? 0) !== 0) {
        if ([60111, 40003].includes(Number(data.errcode))) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '该成员不在允许的企业组织中');
        if ([40029, 40163].includes(Number(data.errcode))) throw new ApiError(401, 'LOGIN_CODE_INVALID', '登录授权已失效，请重新登录');
        throw new Error('upstream');
      }
      return data;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'IDENTITY_UNAVAILABLE', '企业微信身份服务暂时不可用，请稍后重试'); }
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (!this.tokenRequest) this.tokenRequest = (async () => {
      const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
      url.search = new URLSearchParams({ corpid: this.config.corpId, corpsecret: this.config.appSecret }).toString();
      const data = await this.json(url);
      if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') throw new ApiError(503, 'IDENTITY_UNAVAILABLE', '企业微信应用凭据无效');
      this.token = { value: data.access_token, expiresAt: Date.now() + Math.max(0, data.expires_in - 120) * 1000 }; return data.access_token;
    })().finally(() => { this.tokenRequest = undefined; });
    return this.tokenRequest;
  }
  private async api(path: string, params: Record<string, string> = {}, body?: unknown) {
    const url = new URL(`https://qyapi.weixin.qq.com/cgi-bin/${path}`);
    url.search = new URLSearchParams({ access_token: await this.accessToken(), ...params }).toString();
    return this.json(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  private async allowedDepartmentIds(): Promise<Set<string>> {
    const data = await this.api('department/list');
    if (!Array.isArray(data.department)) throw new ApiError(503, 'IDENTITY_UNAVAILABLE', '无法核验允许的企业部门');
    const departments = data.department as { id: number; parentid: number }[];
    const allowed = new Set(this.config.rootDepartmentIds);
    for (let changed = true; changed;) { changed = false; for (const department of departments) if (allowed.has(String(department.parentid)) && !allowed.has(String(department.id))) { allowed.add(String(department.id)); changed = true; } }
    return allowed;
  }
  private principal(data: Record<string, unknown>, allowed: Set<string>): Principal {
    const departments = Array.isArray(data.department) ? data.department.map(String) : [];
    if (typeof data.userid !== 'string' || Number(data.status) !== 1 || !departments.some((id) => allowed.has(id))) throw new ApiError(403, 'ORGANIZATION_REQUIRED', '仅允许企业内部在职且已激活的成员访问');
    return { userId: data.userid, name: typeof data.name === 'string' ? data.name : data.userid, avatarUrl: typeof data.avatar === 'string' && data.avatar.startsWith('https://') ? data.avatar : undefined, departmentIds: departments, organizationActive: true };
  }
  async exchangeCode(code: string) {
    const result = await this.api('auth/getuserinfo', { code });
    if (typeof result.userid !== 'string') throw new ApiError(403, 'ORGANIZATION_REQUIRED', '企业外部联系人不能进入 BochuPath');
    return this.getUser(result.userid);
  }
  async getUser(userId: string) { const [data, allowed] = await Promise.all([this.api('user/get', { userid: userId }), this.allowedDepartmentIds()]); return this.principal(data, allowed); }
  async searchUsers(keyword: string) {
    const allowed = await this.allowedDepartmentIds();
    const lists = await Promise.all([...allowed].map((department_id) => this.api('user/list', { department_id })));
    const users = new Map<string, Principal>();
    for (const list of lists) for (const item of Array.isArray(list.userlist) ? list.userlist : []) {
      try { const user = this.principal(item as Record<string, unknown>, allowed); if (`${user.name} ${user.userId} ${user.departmentIds.join(' ')}`.toLowerCase().includes(keyword.toLowerCase())) users.set(user.userId, user); } catch (error) { if (!(error instanceof ApiError) || error.status !== 403) throw error; }
    }
    return [...users.values()].slice(0, 100);
  }
  async sendNotification(userId: string, text: string) {
    const result = await this.api('message/send', {}, { touser: userId, msgtype: 'text', agentid: Number(this.config.agentId), text: { content: text }, safe: 0, enable_duplicate_check: 1, duplicate_check_interval: 1800 });
    if (result.invaliduser || result.unlicenseduser) throw new ApiError(503, 'NOTIFICATION_FAILED', '企业微信未送达目标成员，请检查应用可见范围');
  }
}
