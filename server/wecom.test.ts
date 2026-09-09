import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from './config';
import { ApiError } from './types';
import { WecomIdentityProvider } from './wecom';

const config: AppConfig = {
  mode: 'wecom', nodeEnv: 'production', enableDevAuth: false, host: '0.0.0.0', port: 3000,
  appOrigin: 'https://bochupath.example.internal', dataDirectory: '/private', distDirectory: '/app/dist',
  initialAdminIds: ['zhangsan'], corpId: 'corp-id', agentId: '1000002', appSecret: 'secret',
  rootDepartmentIds: ['1'], sessionHours: 8, notificationsEnabled: true,
};

function response(data: unknown) { return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })); }

test('WeCom provider builds official login URLs and accepts active members in allowed descendants', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/gettoken')) return response({ errcode: 0, access_token: 'token', expires_in: 7200 });
    if (url.pathname.endsWith('/auth/getuserinfo')) return response({ errcode: 0, userid: 'zhangsan' });
    if (url.pathname.endsWith('/user/get')) return response({ errcode: 0, userid: 'zhangsan', name: '张三', department: [2], status: 1, avatar: 'https://example.invalid/avatar.png' });
    if (url.pathname.endsWith('/department/list')) return response({ errcode: 0, department: [{ id: 1, parentid: 0 }, { id: 2, parentid: 1 }] });
    if (url.pathname.endsWith('/message/send')) return response({ errcode: 0 });
    throw new Error(`unexpected ${url}`);
  };
  const provider = new WecomIdentityProvider(config, fetcher);
  const desktop = new URL(provider.authorizationUrl('state', `${config.appOrigin}/api/bochupath/v1/auth/callback`, false));
  assert.equal(desktop.hostname, 'login.work.weixin.qq.com');
  assert.equal(desktop.searchParams.get('login_type'), 'CorpApp');
  assert.equal(desktop.searchParams.get('agentid'), config.agentId);
  const mobile = new URL(provider.authorizationUrl('state', `${config.appOrigin}/api/bochupath/v1/auth/callback`, true));
  assert.equal(mobile.hostname, 'open.weixin.qq.com');
  assert.equal(mobile.searchParams.get('scope'), 'snsapi_base');
  assert.equal(mobile.hash, '#wechat_redirect');

  const principal = await provider.exchangeCode('one-time-code');
  assert.deepEqual(principal, { userId: 'zhangsan', name: '张三', avatarUrl: 'https://example.invalid/avatar.png', departmentIds: ['2'], organizationActive: true });
  await provider.sendNotification('zhangsan', '权限已开通');
  assert.equal(calls.filter((call) => call.endsWith('/gettoken')).length, 1, 'access token should be reused');
  assert.ok(calls.some((call) => call === 'POST /cgi-bin/message/send'));
});

test('WeCom provider rejects inactive or out-of-scope members', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.pathname.endsWith('/gettoken')) return response({ errcode: 0, access_token: 'token', expires_in: 7200 });
    if (url.pathname.endsWith('/user/get')) return response({ errcode: 0, userid: 'outsider', name: '范围外成员', department: [9], status: 1 });
    if (url.pathname.endsWith('/department/list')) return response({ errcode: 0, department: [{ id: 1, parentid: 0 }, { id: 2, parentid: 1 }, { id: 9, parentid: 0 }] });
    throw new Error(`unexpected ${url}`);
  };
  const provider = new WecomIdentityProvider(config, fetcher);
  await assert.rejects(() => provider.getUser('outsider'), (error) => error instanceof ApiError && error.status === 403 && error.code === 'ORGANIZATION_REQUIRED');
});
