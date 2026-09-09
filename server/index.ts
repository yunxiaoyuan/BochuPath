import { createApplication } from './application';
import { loadConfig } from './config';

const config = loadConfig();
const application = createApplication(config);
application.server.listen(config.port, config.host, () => {
  console.log(`BochuPath service ready: ${config.appOrigin} (${config.mode === 'development' ? '仅本机固定体验身份' : '企业微信身份认证'})`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { application.close(); process.exit(0); });
