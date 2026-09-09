import { resolve } from 'node:path';

export interface AppConfig {
  mode: 'development' | 'wecom'; nodeEnv: string; enableDevAuth: boolean; host: string; port: number;
  appOrigin: string; dataDirectory: string; distDirectory: string; initialAdminIds: string[];
  corpId: string; agentId: string; appSecret: string; rootDepartmentIds: string[];
  sessionHours: number; notificationsEnabled: boolean;
}
export const isLoopback = (value: string) => ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(value);
const list = (input?: string) => (input ?? '').split(',').map((item) => item.trim()).filter(Boolean);
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mode = env.BOCHUPATH_AUTH_MODE ?? 'wecom';
  if (mode !== 'wecom' && mode !== 'development') throw new Error('BOCHUPATH_AUTH_MODE must be wecom or development');
  const config: AppConfig = {
    mode, nodeEnv: env.NODE_ENV ?? 'production', enableDevAuth: env.BOCHUPATH_ENABLE_DEV_AUTH === 'true',
    host: env.BOCHUPATH_HOST ?? '127.0.0.1', port: Number(env.BOCHUPATH_PORT ?? 4181),
    appOrigin: env.BOCHUPATH_APP_ORIGIN ?? 'http://127.0.0.1:4181',
    dataDirectory: resolve(env.BOCHUPATH_DATA_DIRECTORY ?? '.bochupath-data'),
    distDirectory: resolve(env.BOCHUPATH_DIST_DIRECTORY ?? 'dist'), initialAdminIds: list(env.BOCHUPATH_INITIAL_ADMIN_IDS),
    corpId: env.WECOM_CORP_ID ?? '', agentId: env.WECOM_AGENT_ID ?? '', appSecret: env.WECOM_APP_SECRET ?? '',
    rootDepartmentIds: list(env.WECOM_ROOT_DEPARTMENT_IDS), sessionHours: Number(env.BOCHUPATH_SESSION_HOURS ?? 8),
    notificationsEnabled: env.BOCHUPATH_NOTIFICATIONS_ENABLED === 'true',
  };
  validateConfig(config); return config;
}
export function validateConfig(config: AppConfig) {
  const origin = new URL(config.appOrigin);
  if (origin.origin !== config.appOrigin || origin.username || origin.password) throw new Error('APP_ORIGIN must be an exact origin without trailing slash or path');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535 || !Number.isFinite(config.sessionHours) || config.sessionHours < 0.01 || config.sessionHours > 24) throw new Error('Invalid port/session lifetime');
  if (config.mode === 'development') {
    if (config.nodeEnv !== 'development' || !config.enableDevAuth || !isLoopback(config.host) || !isLoopback(origin.hostname)) throw new Error('Development login requires explicit enablement, NODE_ENV=development and loopback host/origin');
  } else {
    if (origin.protocol !== 'https:') throw new Error('WeCom deployment requires HTTPS APP_ORIGIN');
    if (!config.corpId || !/^\d+$/.test(config.agentId) || !config.appSecret || !config.initialAdminIds.length || !config.rootDepartmentIds.length) throw new Error('WeCom credentials, explicit initial admin IDs and allowed root department IDs are required');
    if (config.enableDevAuth) throw new Error('Development authentication must be disabled in WeCom mode');
  }
  if (config.dataDirectory === config.distDirectory || config.dataDirectory.startsWith(config.distDirectory + '/')) throw new Error('Private data must be outside the static directory');
}
