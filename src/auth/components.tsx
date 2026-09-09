import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { apiRequest } from './client';
import { AccessDialog } from './AccessDialog';
import { roleLabels, type AuthConfig, type Invitation, type PermissionRequest } from './types';

function messageOf(error: unknown): string { return error instanceof Error ? error.message : '操作未完成，请重试'; }

export function LoginGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const wasAuthenticated = useRef(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  if (auth.status === 'authenticated') wasAuthenticated.current = true;
  const blocked = auth.enabled && auth.status !== 'authenticated';
  useEffect(() => {
    if (!blocked || auth.status === 'loading') return;
    let active = true;
    setConfigError('');
    apiRequest<AuthConfig>('/auth/config', { notifyAuth: false }).then((next) => { if (active) setConfig(next); }).catch((error) => { if (active) setConfigError(messageOf(error)); });
    return () => { active = false; };
  }, [blocked, auth.status, attempt]);
  if (!auth.enabled) return children;
  const login = () => {
    if (!config?.configured) return;
    let loginUrl: URL;
    try { loginUrl = new URL(config.loginUrl, window.location.origin); }
    catch { setLoginError('登录地址配置有误，请联系管理员'); return; }
    if (loginUrl.origin !== window.location.origin) { setLoginError('登录地址配置有误，请联系管理员'); return; }
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.delete('auth_error');
    loginUrl.searchParams.set('returnTo', returnUrl.pathname === '/login' ? '/diagrams' : `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    window.location.assign(loginUrl.href);
  };
  const retry = () => { setAttempt((value) => value + 1); void auth.refresh(); };
  const developmentLogin = async (userId: string) => {
    setBusy(true); setLoginError('');
    try { await auth.developmentLogin(userId); } catch (error) { setLoginError(messageOf(error)); }
    finally { setBusy(false); }
  };
  const callbackError = new URLSearchParams(window.location.search).get('auth_error');
  return <>
    {!blocked && <div className="auth-app-content" key={auth.session?.user.userId}>{children}</div>}
    {blocked && <main className="auth-login-shell" aria-label="BochuPath 登录">
      <section className="auth-login-panel" aria-busy={busy || auth.status === 'loading'}>
        <div className="auth-brand"><span className="product-mark">路</span><strong>BochuPath 业务通路图</strong></div>
        <h1>{auth.status === 'loading' ? '正在确认登录状态' : wasAuthenticated.current ? '请重新登录' : '欢迎使用 BochuPath'}</h1>
        <p>{wasAuthenticated.current ? '登录已失效或暂时无法确认身份。未保存的编辑仍保留在当前浏览器，登录原账号后可以继续处理。' : '使用企业微信内部成员身份登录。首次进入默认为只读，可申请编辑权限。'}</p>
        {(auth.error || configError || loginError || callbackError) && <p className="auth-alert error" role="alert">{loginError || auth.error || configError || '企业微信登录未完成，请重试；若仍失败，请联系管理员确认成员范围。'}</p>}
        {auth.status === 'loading' && <p role="status">正在连接…</p>}
        {config && !config.configured && <p className="auth-alert warning" role="status">企业微信登录尚未配置完成，请联系管理员开通服务。</p>}
        {config?.configured && config.mode === 'wecom' && <button className="primary-button auth-login-button" onClick={login} disabled={busy}>企业微信登录</button>}
        {config?.mode === 'development' && config.configured && <div className="auth-development-login">
          <p className="auth-alert warning">本地开发体验环境 · 以下账号由开发服务器提供，正式环境仅允许企业微信登录。</p>
          {config.developmentUsers?.map((user) => <button key={user.userId} onClick={() => void developmentLogin(user.userId)} disabled={busy}>{user.name}<span className="auth-role">{roleLabels[user.role]}</span></button>)}
        </div>}
        {auth.status !== 'loading' && <button className="quiet-button auth-retry" onClick={retry} disabled={busy}>重新检查连接</button>}
        <small>企业内部使用 · 编辑权限由管理员审批或授权</small>
      </section>
    </main>}
  </>;
}

export function RequestPermissionDialog({ onClose }: { onClose: () => void }) {
  const { session, refresh } = useAuth();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 10 || reason.trim().length > 200) { setError('请填写 10–200 字的申请原因'); return; }
    setBusy(true); setError('');
    try {
      await apiRequest('/permission-requests', { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      await refresh(); onClose();
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <AccessDialog title="申请编辑权限" onClose={onClose} busy={busy}>
    <form onSubmit={(event) => void submit(event)}>
      <p>申请人：{session?.user.name} · 通过后可编辑图库中的全部通路图。</p>
      <label className="field"><span>申请原因 *</span><textarea aria-label="申请原因" aria-describedby="permission-reason-hint" aria-invalid={!!error} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} rows={4} disabled={busy} placeholder="请说明需要编辑的通路图和使用目的" /></label>
      <div id="permission-reason-hint" className="access-field-hint">请填写 10–200 字<span>{reason.trim().length}/200</span></div>
      {error && <p className="auth-alert error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? '正在提交…' : '提交申请'}</button></div>
    </form>
  </AccessDialog>;
}

export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', click);
    return () => document.removeEventListener('pointerdown', click);
  }, [open]);
  useEffect(() => { setAvatarFailed(false); setOpen(false); setRequestOpen(false); setLogoutOpen(false); }, [auth.session?.user.userId]);
  useEffect(() => {
    if (open) container.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);
  if (!auth.enabled || !auth.session) return null;
  const { user, role, writeRequestStatus } = auth.session;
  const logout = async () => {
    setBusy(true); setError('');
    try { await auth.logout(); setLogoutOpen(false); } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <div className="auth-account" ref={container} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(container.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next]?.focus();
    }
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button className="auth-account-trigger" ref={trigger} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true); } }} aria-haspopup="menu" aria-expanded={open} aria-label={`账号：${user.name}，${roleLabels[role]}`}>
      <span className={`auth-role ${role}`}>{roleLabels[role]}</span>{user.avatarUrl?.startsWith('https://') && !avatarFailed ? <img className="auth-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : <span className="auth-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>}<span className="auth-account-name">{user.name}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="auth-account-menu" role="menu" aria-label="账号菜单">
      <div className="auth-account-detail" role="none"><strong>{user.name}</strong><small>成员账号：{user.userId}</small><small>我的权限：{roleLabels[role]}</small></div>
      {role === 'reader' && <button role="menuitem" disabled={writeRequestStatus === 'pending'} onClick={() => { setOpen(false); setRequestOpen(true); }}>{writeRequestStatus === 'pending' ? '编辑权限审核中' : '申请编辑权限'}</button>}
      {auth.isAdmin && <Link role="menuitem" to="/access" onClick={() => setOpen(false)}>权限管理</Link>}
      <button role="menuitem" onClick={() => { setOpen(false); setLogoutOpen(true); }}>退出登录</button>
    </div>}
    {requestOpen && <RequestPermissionDialog onClose={() => { setRequestOpen(false); trigger.current?.focus(); }} />}
    {logoutOpen && <AccessDialog title="退出登录" onClose={() => { setLogoutOpen(false); trigger.current?.focus(); }} busy={busy}>
      <p>退出当前账号「{user.name}」。未保存的草稿保留在此浏览器，重新登录同一账号后可恢复。</p>
      {error && <p className="auth-alert error" role="alert">{error}</p>}
      <div className="modal-actions"><button onClick={() => { setLogoutOpen(false); trigger.current?.focus(); }} disabled={busy}>取消</button><button className="primary-button" onClick={() => void logout()} disabled={busy}>{busy ? '正在退出…' : '确认退出'}</button></div>
    </AccessDialog>}
  </div>;
}

export function PermissionBanner() {
  const { enabled, session, canWrite, refresh } = useAuth();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cancel, setCancel] = useState<PermissionRequest | null>(null);
  useEffect(() => {
    if (!enabled || !session || canWrite) { setRequests([]); setInvitations([]); return; }
    let active = true;
    Promise.all([
      apiRequest<PermissionRequest[]>('/permission-requests/me'),
      apiRequest<Invitation[]>('/invitations/me'),
    ]).then(([nextRequests, nextInvitations]) => {
      if (!active) return;
      setRequests(nextRequests); setInvitations(nextInvitations); setError('');
    }).catch((failure) => { if (active) setError(messageOf(failure)); });
    return () => { active = false; };
  }, [enabled, session, canWrite, attempt]);
  if (!enabled || !session || canWrite) return null;
  const pending = requests.find((request) => request.status === 'pending');
  const latest = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const isPending = session.writeRequestStatus === 'pending' || !!pending;
  const invitationsPending = invitations.filter((invitation) => invitation.status === 'pending');
  const mutate = async (path: string, method = 'POST') => {
    setBusy(true); setError('');
    try {
      await apiRequest(path, { method, body: method === 'POST' ? '{}' : undefined });
      setCancel(null); await refresh(); setAttempt((value) => value + 1);
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <div className="permission-banner-stack">
    <div className="permission-banner" role="status"><span>{isPending ? '编辑权限审核中，当前仍为只读。' : latest?.status === 'rejected' ? `编辑申请未通过：${latest.decisionReason || '请联系管理员了解原因'}` : '当前为只读权限，可查看和导出通路图。'}</span><div className="access-row-actions">{pending && <button className="small" onClick={() => setCancel(pending)} disabled={busy}>撤回申请</button>}<button className="small" disabled={isPending || busy} onClick={() => setRequestOpen(true)}>{isPending ? '等待审批' : latest?.status === 'rejected' ? '重新申请' : '申请编辑权限'}</button></div></div>
    {invitationsPending.map((invitation) => <div className="permission-banner invitation" key={invitation.id}><span><strong>收到编辑邀请</strong>{invitation.message && ` · ${invitation.message}`}<small>有效期至 {new Date(invitation.expiresAt).toLocaleString('zh-CN')}</small></span><div className="access-row-actions"><button className="small" disabled={busy} onClick={() => void mutate(`/invitations/${encodeURIComponent(invitation.id)}/decline`)}>拒绝邀请</button><button className="primary-button small" disabled={busy} onClick={() => void mutate(`/invitations/${encodeURIComponent(invitation.id)}/accept`)}>接受邀请</button></div></div>)}
    {error && <div className="permission-banner auth-alert error" role="alert"><span>{error}</span><button className="small" onClick={() => setAttempt((value) => value + 1)}>重新加载</button></div>}
    {requestOpen && <RequestPermissionDialog onClose={() => { setRequestOpen(false); setAttempt((value) => value + 1); }} />}
    {cancel && <AccessDialog title="撤回编辑申请" onClose={() => setCancel(null)} busy={busy}><p>撤回后管理员将无法再审批此申请，你可以重新提交。</p>{error && <p role="alert" className="auth-alert error">{error}</p>}<div className="modal-actions"><button onClick={() => setCancel(null)} disabled={busy}>保留申请</button><button className="primary-button" onClick={() => void mutate(`/permission-requests/${encodeURIComponent(cancel.id)}`, 'DELETE')} disabled={busy}>确认撤回</button></div></AccessDialog>}
  </div>;
}
