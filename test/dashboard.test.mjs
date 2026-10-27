import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, basename} from 'node:path';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';
import {getDashboard, queryQQ} from '../windows/status-data.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'maodie-dashboard-'));
  const configPath = join(root, 'config.json'), controlsPath = join(root, 'controls.json');
  const config = {selfId: '10001', ownerId: '40001', groups: [{groupId: '20001', targetId: '30001'}],
    onebot: {url: 'ws://127.0.0.1:3002', token: 'private-ws-key'},
    llm: {apiKey: 'private-model-key'}, enabledOnStart: false,
    behavior: {spice: 3}, media: {stickersEnabled: true}, politeUsers: [{userId: '60001'}]};
  const controls = {selfId: '10001', ownerId: '40001', groups: [
    {groupId: '20001', enabled: true, wildMode: true, spice: 0, stickersEnabled: true},
    {groupId: '29999', enabled: true, wildMode: true, spice: 3, stickersEnabled: true}]};
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(controlsPath, JSON.stringify(controls));
  try {await run({configPath, controlsPath, config, controls});}
  finally {
    assert.equal(dirname(root), tmpdir()); assert.ok(basename(root).startsWith('maodie-dashboard-'));
    await rm(root, {recursive: true, force: true});
  }
}

test('界面状态区分服务停止与QQ在线，仅显示允许的群，不包含密钥或私人规则', async () => {
  await fixture(async ({configPath, controlsPath}) => {
    const result = await getDashboard({configPath, controlsPath, listenerRunning: false,
      query: async () => ({online: true, accountMatches: true})});
    assert.equal(result.listenerRunning, false); assert.equal(result.online, true);
    assert.equal(result.groups.length, 1); assert.equal(result.groups[0].spice, 0);
    assert.equal(result.groups[0].enabled, true); assert.equal(result.groups[0].settingsKnown, true);
    const json = JSON.stringify(result);
    for (const secret of ['private-model-key', 'private-ws-key', '60001', '29999', '40001']) assert.ok(!json.includes(secret));
  });
});

test('QQ不可达时保留群设置但标记连接未知，错账号的保存设置不冒充当前状态', async () => {
  await fixture(async ({configPath, controlsPath, controls}) => {
    const query = async () => {throw new Error('无法连接QQ');};
    const offline = await getDashboard({configPath, controlsPath, listenerRunning: true, query});
    assert.equal(offline.online, null); assert.equal(offline.error, '无法连接QQ');
    assert.equal(offline.groups[0].enabled, true);
    controls.ownerId = '49999'; await writeFile(controlsPath, JSON.stringify(controls));
    const mismatch = await getDashboard({configPath, controlsPath, listenerRunning: true, query});
    assert.equal(mismatch.groups[0].settingsKnown, false); assert.equal(mismatch.warnings.length, 1);
  });
});

test('状态查询只读登录与在线信息；账号不匹配时停止继续查询', async () => {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0});
  await once(server, 'listening');
  const actions = []; let account = 10001;
  server.on('connection', ws => ws.on('message', raw => {
    const body = JSON.parse(raw); actions.push(body.action);
    ws.send(JSON.stringify({retcode: 0, echo: body.echo,
      data: body.action === 'get_login_info' ? {user_id: account} : {online: true}}));
  }));
  const config = {selfId: '10001', onebot: {url: `ws://127.0.0.1:${server.address().port}`, token: 'test'}};
  try {
    assert.deepEqual(await queryQQ(config), {online: true, accountMatches: true});
    assert.deepEqual(actions, ['get_login_info', 'get_status']);
    actions.length = 0; account = 10002;
    assert.deepEqual(await queryQQ(config), {online: false, accountMatches: false});
    assert.deepEqual(actions, ['get_login_info']);
  } finally {await new Promise(resolve => server.close(resolve));}
});
