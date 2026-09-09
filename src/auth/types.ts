export type Role = 'reader' | 'editor' | 'admin';
export interface UserPrincipal {
  userId: string;
  name: string;
  avatarUrl?: string;
  departmentIds: string[];
  organizationActive?: boolean;
}
export interface Session {
  user: UserPrincipal;
  role: Role;
  capabilities: string[];
  csrfToken: string;
  writeRequestStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled';
}
export interface AuthConfig {
  mode: 'wecom' | 'development';
  configured: boolean;
  loginUrl: string;
  notificationsEnabled?: boolean;
  developmentUsers?: (Pick<UserPrincipal, 'userId' | 'name'> & { role: Role })[];
}
export interface PermissionRequest {
  id: string;
  applicantUserId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  decisionReason?: string;
  user?: UserPrincipal;
}
export interface Invitation {
  id: string;
  inviteeUserId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  user?: UserPrincipal;
}
export interface Member {
  user: UserPrincipal;
  role: Role;
  grant?: { source: string; reason: string; grantedAt: string; grantedBy: string; status?: 'active' | 'revoked' };
}
export interface DeliveryNotification {
  id: string;
  userId: string;
  text: string;
  status: 'pending' | 'sent' | 'failed' | 'disabled';
  attempts: number;
  createdAt: string;
  lastError?: string;
  sentAt?: string;
}
export interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}
export const roleLabels: Record<Role, string> = { reader: '只读', editor: '编辑者', admin: '管理员' };
