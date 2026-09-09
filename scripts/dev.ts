import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
const demo = process.argv.includes('--demo');
const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 5180;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('开发页面端口无效');
const apiPort = process.env.BOCHUPATH_API_PORT || '4181';
const env = {
  ...process.env,
  NODE_ENV: 'development',
  BOCHUPATH_HOST: '127.0.0.1',
  BOCHUPATH_PORT: apiPort,
  BOCHUPATH_API_PORT: apiPort,
  ...(demo ? {
    BOCHUPATH_AUTH_MODE: 'development',
    BOCHUPATH_ENABLE_DEV_AUTH: 'true',
    BOCHUPATH_APP_ORIGIN: `http://127.0.0.1:${port}`,
    BOCHUPATH_DATA_DIRECTORY: resolve(process.env.BOCHUPATH_DEMO_DATA_DIRECTORY || '.bochupath/auth-demo'),
    BOCHUPATH_NOTIFICATIONS_ENABLED: 'false',
  } : {}),
};
const api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit', env });
const ui = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'inherit', env });
let stopped = false;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  api.kill('SIGTERM');
  ui.kill('SIGTERM');
  process.exitCode = code;
}
api.on('exit', code => stop(code || 0));
ui.on('exit', code => stop(code || 0));
api.on('error', () => stop(1));
ui.on('error', () => stop(1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log(demo ? `BochuPath 本地权限体验：http://127.0.0.1:${port}（固定测试账号，不是企业微信登录）` : `BochuPath 开发页面：http://127.0.0.1:${port}`);
