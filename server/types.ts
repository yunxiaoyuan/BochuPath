export type Role = 'reader' | 'editor' | 'admin';
export interface Principal { userId: string; name: string; avatarUrl?: string; departmentIds: string[]; organizationActive: boolean }
export interface User extends Principal { firstSeenAt: string; lastSeenAt: string }
export interface Grant { id: string; userId: string; role: 'editor' | 'admin'; status: 'active' | 'revoked'; source: 'bootstrap' | 'invitation' | 'application' | 'direct'; sourceId?: string; grantedBy: string; grantedAt: string; reason: string; version: number; revokedBy?: string; revokedAt?: string }
export interface PermissionRequest { id: string; applicantUserId: string; reason: string; requestedRole: 'editor'; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt: string; decidedBy?: string; decidedAt?: string; decisionReason?: string }
export interface Invitation { id: string; inviteeUserId: string; role: 'editor'; message: string; status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'; invitedBy: string; createdAt: string; expiresAt: string; respondedAt?: string }
export interface Session { userId: string; csrfToken: string; expiresAt: number; roleSeen: Role }
export interface Audit { id: string; actorUserId: string; action: string; targetType: string; targetId: string; before?: unknown; after?: unknown; requestId: string; createdAt: string }
export interface Notification { id: string; userId: string; text: string; status: 'pending' | 'sent' | 'failed' | 'disabled'; attempts: number; createdAt: string; lastError?: string; sentAt?: string }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export const capabilities = (role: Role): string[] => ['diagram:read', 'diagram:export', ...(role === 'reader' ? ['permission:apply'] : ['diagram:write']), ...(role === 'admin' ? ['permission:manage', 'audit:read'] : [])];
