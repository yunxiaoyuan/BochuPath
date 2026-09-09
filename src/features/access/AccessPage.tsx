import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccessDialog } from '../../auth/AccessDialog';
import { useAuth } from '../../auth/AuthProvider';
import { apiRequest } from '../../auth/client';
import { AccountMenu } from '../../auth/components';
import { roleLabels, type AuditEvent, type DeliveryNotification, type Invitation, type Member, type PermissionRequest, type Role, type UserPrincipal } from '../../auth/types';

type Tab = 'requests' | 'members' | 'invitations' | 'audit' | 'notifications';
type Action =
  | { kind: 'grant'; user?: UserPrincipal; currentRole?: Role }
  | { kind: 'invite'; user?: UserPrincipal }
  | { kind: 'revoke'; member: Member }
  | { kind: 'review'; request: PermissionRequest }
  | { kind: 'cancel-invitation'; invitation: Invitation };
const tabs: { id: Tab; label: string }[] = [{ id: 'requests', label: '待审批' }, { id: 'members', label: '成员权限' }, { id: 'invitations', label: '邀请记录' }, { id: 'audit', label: '审计日志' }, { id: 'notifications', label: '通知状态' }];
const notificationLabels: Record<DeliveryNotification['status'], string> = { pending: '等待发送', sent: '已送达', failed: '发送失败', disabled: '尚未启用' };
const statusLabels: Record<string, string> = { pending: '待处理', accepted: '已接受', declined: '已拒绝', expired: '已过期', cancelled: '已取消', approved: '已批准', rejected: '已拒绝' };
const sourceLabels: Record<string, string> = { application: '申请审批', invitation: '接受邀请', direct: '管理员开通', bootstrap: '初始管理员' };
const actionLabels: Record<string, string> = {
  'auth.login': '登录', 'auth.logout': '退出登录', 'login.success': '登录成功', 'login.denied': '登录被拒绝',
  'permission.request': '提交编辑申请', 'permission.request.created': '提交编辑申请', 'permission.request.approved': '批准编辑申请', 'permission.request.rejected': '拒绝编辑申请', 'permission.request.cancelled': '撤回编辑申请',
  'permission_request.create': '提交编辑申请', 'permission_request.approve': '批准编辑申请', 'permission_request.reject': '拒绝编辑申请', 'permission_request.cancel': '撤回编辑申请',
  'invitation.create': '创建邀请', 'invitation.created': '创建邀请', 'invitation.accept': '接受邀请', 'invitation.accepted': '接受邀请', 'invitation.decline': '拒绝邀请', 'invitation.declined': '拒绝邀请', 'invitation.cancel': '取消邀请', 'invitation.cancelled': '取消邀请',
  'role.grant': '开通权限', 'role.granted': '开通权限', 'role.revoke': '撤销权限', 'role.revoked': '撤销权限',
  'diagram.create': '创建通路图', 'diagram.created': '创建通路图', 'diagram.save': '保存通路图', 'diagram.update': '更新通路图', 'diagram.updated': '更新通路图', 'diagram.delete': '删除通路图', 'diagram.deleted': '删除通路图',
  'request.denied': '请求被拒绝', 'write.denied': '写入被拒绝', 'permission.denied': '权限不足', 'diagram.conflict': '保存版本冲突',
  'invitation.expired': '邀请已过期', 'notification.retry': '重试企业微信通知',
};
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('zh-CN', { hour12: false }); }
function messageOf(error: unknown) { return error instanceof Error ? error.message : '操作未完成，请重试'; }
function identity(user: UserPrincipal | undefined, userId: string) { return <div className="access-identity"><strong>{user?.name || userId}</strong><small>{userId}</small></div>; }
function departments(user?: UserPrincipal) { return user?.departmentIds.length ? user.departmentIds.join('、') : '—'; }

export function AccessPage() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [notifications, setNotifications] = useState<DeliveryNotification[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!auth.isAdmin) return;
    let active = true;
    setLoading(true); setError('');
    const load = async () => {
      try {
        if (tab === 'requests') { const data = await apiRequest<PermissionRequest[]>('/admin/permission-requests?status=pending'); if (active) setRequests(data); }
        if (tab === 'members') { const data = await apiRequest<Member[]>('/admin/members'); if (active) setMembers(data); }
        if (tab === 'invitations') { const data = await apiRequest<Invitation[]>('/admin/invitations'); if (active) setInvitations(data); }
        if (tab === 'audit') { const data = await apiRequest<AuditEvent[]>('/admin/audit-events'); if (active) setAudit(data); }
        if (tab === 'notifications') { const data = await apiRequest<DeliveryNotification[]>('/admin/notifications'); if (active) setNotifications(data); }
      } catch (failure) { if (active) setError(messageOf(failure)); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [auth.isAdmin, auth.session?.user.userId, tab, attempt]);
  if (!auth.isAdmin) return <main className="access-denied"><h1>权限管理仅向管理员开放</h1><p>你仍可返回图库查看通路图。</p><Link to="/diagrams">返回通路图库</Link></main>;
  const search = keyword.trim().toLocaleLowerCase();
  const includes = (...values: (string | undefined)[]) => values.some((value) => value?.toLocaleLowerCase().includes(search));
  const filteredRequests = requests.filter((request) => includes(request.user?.name, request.applicantUserId, request.reason, departments(request.user)));
  const filteredMembers = members.filter((member) => includes(member.user.name, member.user.userId, roleLabels[member.role], departments(member.user)));
  const filteredInvitations = invitations.filter((invitation) => includes(invitation.user?.name, invitation.inviteeUserId, invitation.message, statusLabels[invitation.status]));
  const filteredAudit = audit.filter((event) => includes(event.actorUserId, actionLabels[event.action], event.action, event.targetId));
  const filteredNotifications = notifications.filter((notification) => includes(notification.userId, notification.text, notificationLabels[notification.status]));
  const rows = tab === 'requests' ? filteredRequests.length : tab === 'members' ? filteredMembers.length : tab === 'invitations' ? filteredInvitations.length : tab === 'notifications' ? filteredNotifications.length : filteredAudit.length;
  const selectTab = (next: Tab) => { setTab(next); setKeyword(''); setNotice(''); };
  const retryNotification = async (notification: DeliveryNotification) => {
    setRetrying(notification.id); setError(''); setNotice('');
    try {
      await apiRequest(`/admin/notifications/${encodeURIComponent(notification.id)}/retry`, { method: 'POST', body: '{}' });
      setNotice('通知已加入重试队列，稍后刷新可查看送达结果');
      setAttempt((value) => value + 1);
    } catch (failure) { setError(messageOf(failure)); }
    finally { setRetrying(null); }
  };
  return <div className="access-page">
    <header className="access-header"><div className="auth-brand"><span className="product-mark">路</span><Link to="/diagrams">BochuPath</Link><span className="access-separator">/</span><strong>权限管理</strong></div><AccountMenu /></header>
    <main className="access-main">
      <div className="access-page-title"><div><h1>权限管理</h1><p>内部成员默认只读。开通编辑权限后，可修改图库中的全部通路图。</p></div><Link to="/diagrams">返回图库</Link></div>
      <div className="access-tabs" role="tablist" aria-label="权限管理分类" onKeyDown={(event) => {
        const current = tabs.findIndex((item) => item.id === tab);
        const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); selectTab(tabs[next]!.id); tabRefs.current[next]?.focus();
      }}>{tabs.map((item, index) => <button key={item.id} ref={(element) => { tabRefs.current[index] = element; }} role="tab" id={`access-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`access-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)}>{item.label}{item.id === 'requests' && requests.length > 0 && <span className="access-count">{requests.length}</span>}</button>)}</div>
      <section className="access-content" role="tabpanel" id={`access-panel-${tab}`} aria-labelledby={`access-tab-${tab}`} aria-busy={loading}>
        <div className="access-toolbar"><label className="access-search"><span className="sr-only">搜索当前列表</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={tab === 'audit' ? '搜索操作者、操作或对象' : '搜索成员、部门或状态'} /></label><div className="access-row-actions"><button onClick={() => setAttempt((value) => value + 1)} disabled={loading}>刷新</button>{(tab === 'members' || tab === 'invitations') && <button onClick={() => setAction({ kind: 'invite' })}>邀请成员</button>}{tab === 'members' && <button className="primary-button" onClick={() => setAction({ kind: 'grant' })}>直接开通</button>}</div></div>
        {notice && <p className="auth-alert success" role="status">{notice}</p>}
        {error && <p className="auth-alert error" role="alert">{error}<button className="small" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
        {loading ? <div className="access-empty" role="status">正在加载{tabs.find((item) => item.id === tab)?.label}…</div> : error ? null : rows === 0 ? <div className="access-empty">{search ? '没有匹配的记录' : tab === 'requests' ? '暂无待审批申请' : '暂无记录'}{search && <button className="small" onClick={() => setKeyword('')}>清除筛选</button>}</div> : <div className="access-table-scroll">
          {tab === 'requests' && <table className="access-table"><caption className="sr-only">待审批编辑权限申请</caption><thead><tr><th>申请人</th><th>部门</th><th>申请原因</th><th>申请时间</th><th>操作</th></tr></thead><tbody>{filteredRequests.map((request) => <tr key={request.id}><td>{identity(request.user, request.applicantUserId)}</td><td>{departments(request.user)}</td><td className="access-reason-cell">{request.reason}</td><td>{date(request.createdAt)}</td><td><button className="small primary-button" onClick={() => setAction({ kind: 'review', request })}>审批</button></td></tr>)}</tbody></table>}
          {tab === 'members' && <table className="access-table"><caption className="sr-only">成员权限</caption><thead><tr><th>成员</th><th>部门</th><th>当前角色</th><th>授权来源</th><th>操作</th></tr></thead><tbody>{filteredMembers.map((member) => <tr key={member.user.userId}><td>{identity(member.user, member.user.userId)}{member.user.userId === auth.session?.user.userId && <small className="access-self">当前账号</small>}</td><td>{departments(member.user)}</td><td><span className={`auth-role ${member.role}`}>{roleLabels[member.role]}</span>{member.user.organizationActive === false && <small className="access-cell-note">已不属于企业组织</small>}</td><td>{member.grant?.status === 'revoked' ? '已撤销授权' : member.grant ? sourceLabels[member.grant.source] || member.grant.source : '默认只读'}{member.grant?.reason && <small className="access-cell-note">{member.grant.reason}</small>}</td><td><div className="access-row-actions"><button className="small" disabled={member.user.organizationActive === false} onClick={() => setAction({ kind: 'grant', user: member.user, currentRole: member.role })}>{member.role === 'reader' ? '开通权限' : '调整角色'}</button>{(member.role !== 'reader' || member.grant?.status === 'active') && <button className="small danger-text" onClick={() => setAction({ kind: 'revoke', member })}>撤销权限</button>}</div></td></tr>)}</tbody></table>}
          {tab === 'invitations' && <table className="access-table"><caption className="sr-only">邀请记录</caption><thead><tr><th>被邀请人</th><th>说明</th><th>状态</th><th>有效期至</th><th>邀请人</th><th>操作</th></tr></thead><tbody>{filteredInvitations.map((invitation) => <tr key={invitation.id}><td>{identity(invitation.user, invitation.inviteeUserId)}</td><td className="access-reason-cell">{invitation.message || '—'}</td><td><span className={`access-status ${invitation.status}`}>{statusLabels[invitation.status]}</span></td><td>{date(invitation.expiresAt)}</td><td>{invitation.invitedBy}</td><td>{invitation.status === 'pending' && <button className="small danger-text" onClick={() => setAction({ kind: 'cancel-invitation', invitation })}>取消邀请</button>}</td></tr>)}</tbody></table>}
          {tab === 'audit' && <table className="access-table"><caption className="sr-only">权限与数据操作审计日志</caption><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody>{filteredAudit.map((event) => <tr key={event.id}><td>{date(event.createdAt)}</td><td>{event.actorUserId}</td><td>{actionLabels[event.action] || event.action}</td><td className="access-id-cell">{event.targetId || '—'}</td><td><details><summary>查看详情</summary><dl className="access-audit-detail"><dt>请求编号</dt><dd>{event.requestId}</dd>{event.before !== undefined && <><dt>变更前</dt><dd><pre>{JSON.stringify(event.before, null, 2)}</pre></dd></>}{event.after !== undefined && <><dt>变更后</dt><dd><pre>{JSON.stringify(event.after, null, 2)}</pre></dd></>}</dl></details></td></tr>)}</tbody></table>}
          {tab === 'notifications' && <table className="access-table"><caption className="sr-only">企业微信通知送达状态</caption><thead><tr><th>接收成员</th><th>通知内容</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{filteredNotifications.map((notification) => <tr key={notification.id}><td>{notification.userId}</td><td className="access-reason-cell">{notification.text}</td><td><span className={`access-status ${notification.status}`}>{notificationLabels[notification.status]}</span>{notification.lastError && <small className="access-cell-note">{notification.lastError}</small>}{notification.status === 'disabled' && <small className="access-cell-note">权限操作已生效；请管理员启用企业微信通知后重试</small>}</td><td>{date(notification.createdAt)}{notification.sentAt && <small className="access-cell-note">送达：{date(notification.sentAt)}</small>}</td><td>{(notification.status === 'failed' || notification.status === 'disabled') && <button className="small" disabled={retrying !== null} onClick={() => void retryNotification(notification)}>{retrying === notification.id ? '正在重试…' : '重新发送'}</button>}</td></tr>)}</tbody></table>}
        </div>}
        {!loading && !error && <footer className="access-list-footer">{rows} 条记录{tab === 'audit' && ' · 审计日志仅供查看，不可修改或删除'}</footer>}
      </section>
    </main>
    {action && <AdminActionDialog action={action} onClose={() => setAction(null)} onSuccess={(message) => { setNotice(message); setAction(null); setAttempt((value) => value + 1); void auth.refresh(); }} />}
  </div>;
}

function AdminActionDialog({ action, onClose, onSuccess }: { action: Action; onClose: () => void; onSuccess: (message: string) => void }) {
  const [selectedUser, setSelectedUser] = useState<UserPrincipal | null>((action.kind === 'grant' || action.kind === 'invite') ? action.user ?? null : null);
  const [users, setUsers] = useState<UserPrincipal[]>([]);
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState<Role>(action.kind === 'grant' && action.currentRole === 'admin' ? 'admin' : 'editor');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const selecting = (action.kind === 'grant' || action.kind === 'invite') && !action.user;
  useEffect(() => {
    if (!selecting) return;
    let active = true;
    setSearching(true); setSearchError('');
    const timer = window.setTimeout(() => {
      apiRequest<UserPrincipal[]>(`/admin/org-users?keyword=${encodeURIComponent(keyword.trim())}`).then((next) => { if (active) setUsers(next); }).catch((failure) => { if (active) setSearchError(messageOf(failure)); }).finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selecting, keyword, searchAttempt]);
  const title = action.kind === 'review' ? '审批编辑权限申请' : action.kind === 'grant' ? '直接开通或调整权限' : action.kind === 'invite' ? '邀请成员' : action.kind === 'revoke' ? '撤销成员权限' : '取消编辑邀请';
  const run = async (decision?: 'approve' | 'reject') => {
    const trimmed = reason.trim();
    if ((action.kind === 'grant' || action.kind === 'invite') && !selectedUser) { setError('请从企业内部成员中选择一人'); return; }
    if ((action.kind === 'grant' || action.kind === 'revoke' || decision === 'reject') && !trimmed) { setError('请填写操作原因'); return; }
    if (action.kind === 'grant' && !confirmed) { setConfirmed(true); return; }
    setBusy(true); setError('');
    try {
      if (action.kind === 'grant') {
        await apiRequest(`/admin/role-grants/${encodeURIComponent(selectedUser!.userId)}`, { method: 'PUT', body: JSON.stringify({ role, reason: trimmed }) });
        onSuccess(`已将 ${selectedUser!.name} 设置为${roleLabels[role]}`);
      } else if (action.kind === 'invite') {
        await apiRequest('/admin/invitations', { method: 'POST', body: JSON.stringify({ inviteeUserId: selectedUser!.userId, message: trimmed, expiresInDays: 7 }) });
        onSuccess(`已邀请 ${selectedUser!.name}，对方接受后获得编辑权限`);
      } else if (action.kind === 'review') {
        await apiRequest(`/admin/permission-requests/${encodeURIComponent(action.request.id)}/${decision}`, { method: 'POST', body: JSON.stringify({ reason: trimmed }) });
        onSuccess(decision === 'approve' ? '申请已批准，编辑权限立即生效' : '申请已拒绝，已记录拒绝原因');
      } else if (action.kind === 'revoke') {
        await apiRequest(`/admin/role-grants/${encodeURIComponent(action.member.user.userId)}`, { method: 'DELETE', body: JSON.stringify({ reason: trimmed }) });
        onSuccess(`已撤销 ${action.member.user.name} 的写权限，该成员现在为只读`);
      } else {
        await apiRequest(`/admin/invitations/${encodeURIComponent(action.invitation.id)}`, { method: 'DELETE' });
        onSuccess('邀请已取消');
      }
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <AccessDialog title={title} onClose={onClose} busy={busy} drawer={action.kind === 'review'}>
    <form onSubmit={(event) => { event.preventDefault(); void run(action.kind === 'review' ? 'approve' : undefined); }}>
      {selecting && <div className="access-member-picker"><label className="field"><span>选择内部成员 *</span><input aria-label="搜索企业内部成员" placeholder="输入姓名或企业微信账号" value={keyword} onChange={(event) => { setKeyword(event.target.value); setConfirmed(false); }} disabled={busy} /></label>{searching ? <p role="status">正在搜索…</p> : searchError ? <p className="auth-alert error" role="alert">{searchError}<button type="button" onClick={() => setSearchAttempt((value) => value + 1)}>重试</button></p> : <div className="access-user-options" role="group" aria-label="企业内部成员搜索结果">{users.length ? users.map((user) => <label key={user.userId}><input type="radio" name="org-user" checked={selectedUser?.userId === user.userId} disabled={busy} onChange={() => { setSelectedUser(user); setConfirmed(false); }} /><span>{user.name}<small>{user.userId} · 部门 {departments(user)}</small></span></label>) : <p>没有匹配的企业内部成员</p>}</div>}</div>}
      {(action.kind === 'grant' || action.kind === 'invite') && selectedUser && <p className="auth-alert">已选择：{selectedUser.name}（{selectedUser.userId}）</p>}
      {action.kind === 'review' && <div className="access-review-detail"><dl><dt>申请人</dt><dd>{action.request.user?.name || action.request.applicantUserId}</dd><dt>成员账号</dt><dd>{action.request.applicantUserId}</dd><dt>部门</dt><dd>{departments(action.request.user)}</dd><dt>申请时间</dt><dd>{date(action.request.createdAt)}</dd><dt>申请原因</dt><dd className="access-request-reason">{action.request.reason}</dd></dl><p>批准后该成员可编辑、导入和删除图库中的全部通路图。</p></div>}
      {action.kind === 'revoke' && <p className="auth-alert warning">将撤销 {action.member.user.name}（{roleLabels[action.member.role]}）的写权限，正在编辑的内容将无法保存到服务器。系统不允许撤销最后一位管理员。</p>}
      {action.kind === 'cancel-invitation' && <p>确认取消发给 {action.invitation.user?.name || action.invitation.inviteeUserId} 的邀请？取消后对方将无法接受此邀请。</p>}
      {action.kind === 'grant' && <label className="field"><span>授予角色 *</span><select value={role} onChange={(event) => { setRole(event.target.value as Role); setConfirmed(false); }} disabled={busy}><option value="editor">编辑者 · 可修改全部通路图</option><option value="admin">管理员 · 可修改全部通路图和管理权限</option></select></label>}
      {action.kind === 'invite' && <p>邀请有效期为 7 天。被邀请人登录并接受后，才会获得编辑权限。</p>}
      {action.kind !== 'cancel-invitation' && <label className="field"><span>{action.kind === 'invite' ? '邀请说明（选填）' : action.kind === 'review' ? '审批意见（拒绝时必填）' : '操作原因 *'}</span><textarea aria-label={action.kind === 'invite' ? '邀请说明' : action.kind === 'review' ? '审批意见' : '操作原因'} value={reason} rows={3} maxLength={200} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} disabled={busy} /></label>}
      {confirmed && action.kind === 'grant' && <p className={`auth-alert ${role === 'admin' ? 'warning' : ''}`}>请确认：立即将 {selectedUser?.name} 设置为{roleLabels[role]}。{role === 'admin' ? '该成员将能邀请、授权和撤销其他成员的权限。' : '该成员将能编辑全部通路图。'}</p>}
      {error && <p className="auth-alert error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button>{action.kind === 'review' && <button className="danger-text" type="button" onClick={() => void run('reject')} disabled={busy}>拒绝</button>}<button className={action.kind === 'revoke' || action.kind === 'cancel-invitation' ? 'danger-button' : 'primary-button'} type="submit" disabled={busy}>{busy ? '正在处理…' : action.kind === 'review' ? '批准并开通' : action.kind === 'grant' ? confirmed ? '确认开通' : '下一步：确认权限' : action.kind === 'invite' ? '发送邀请' : action.kind === 'revoke' ? '确认撤销' : '确认取消邀请'}</button></div>
    </form>
  </AccessDialog>;
}
