const API_BASE = '/api/bochupath/v1';
export const AUTH_CHANGE_EVENT = 'bochupath:auth-change';
let currentCsrfToken: string | null = null;
let currentUserId: string | null = null;

export function setSessionIdentity(userId: string | null, csrfToken: string | null): void {
  if (currentUserId !== userId) window.dispatchEvent(new CustomEvent('bochupath:auth-user-changing', { detail: { previousUserId: currentUserId, userId } }));
  currentUserId = userId;
  currentCsrfToken = csrfToken;
}
export function getCurrentUserId(): string | null { return currentUserId; }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends RequestInit { notifyAuth?: boolean }

/** The server owns identity and roles. Only its session response populates this in-memory CSRF value. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new ApiError(0, 'INVALID_API_PATH', '接口地址无效');
  }
  const { notifyAuth = true, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (currentCsrfToken) headers.set('X-CSRF-Token', currentCsrfToken);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init, method, headers, credentials: 'include', cache: 'no-store', signal: controller.signal,
    });
    const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const failure = body && typeof body === 'object' && 'error' in body ? body.error : null;
      const code = failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : `HTTP_${response.status}`;
      const message = failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : '请求未完成，请重试或联系管理员';
      if (notifyAuth && (response.status === 401 || response.status === 403)) {
        if (response.status === 401) window.dispatchEvent(new Event('bochupath:auth-expiring'));
        window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: { status: response.status, code } }));
      }
      throw new ApiError(response.status, code, message);
    }
    if (response.status !== 204 && body === undefined) throw new ApiError(503, 'SERVICE_UNAVAILABLE', '登录与权限服务尚未连接，请联系管理员完成部署');
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', controller.signal.aborted ? '连接超时，请重试' : '无法连接服务，请检查网络后重试');
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
