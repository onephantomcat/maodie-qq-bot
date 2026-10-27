import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';

export function queryQQ(config, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const pending = new Map();
    let settled = false;
    const ws = new WebSocket(config.onebot.url, {
      headers: {Authorization: `Bearer ${config.onebot.token}`}, handshakeTimeout: timeoutMs
    });
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      for (const request of pending.values()) request.reject(new Error('QQ连接已结束'));
      pending.clear();
      ws.on('error', () => {});
      ws.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('QQ状态检查超时，请检查登录与连接')), timeoutMs);
    const call = action => new Promise((resolve, reject) => {
      pending.set(action, {resolve, reject});
      ws.send(JSON.stringify({action, params: {}, echo: action}));
    });
    ws.on('message', raw => {
      let body; try {body = JSON.parse(raw);} catch {return;}
      const request = pending.get(body.echo);
      if (!request) return;
      pending.delete(body.echo);
      body.retcode === 0 ? request.resolve(body.data) : request.reject(new Error('QQ状态查询失败'));
    });
    ws.on('error', () => finish(new Error('无法连接QQ，请检查本机登录服务')));
    ws.on('close', () => {if (!settled) finish(new Error('QQ连接已关闭，请重新检查'));});
    ws.on('open', async () => {
      try {
        const login = await call('get_login_info');
        const accountMatches = String(login?.user_id) === config.selfId;
        if (!accountMatches) {finish(null, {online: false, accountMatches: false}); return;}
        const status = await call('get_status');
        finish(null, {online: status?.online === true, accountMatches: true});
      } catch (error) {finish(error);}
    });
  });
}

export async function getDashboard({configPath, controlsPath, listenerRunning, query = queryQQ}) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  let saved = null;
  const warnings = [];
  try {
    saved = JSON.parse(await readFile(controlsPath, 'utf8'));
    if (saved.selfId !== config.selfId || saved.ownerId !== config.ownerId || !Array.isArray(saved.groups)) {
      saved = null; warnings.push('已保存的群设置与当前账号不匹配，请检查配置');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') warnings.push('群设置暂时无法读取，请稍后刷新');
  }
  const groups = config.groups.map(group => {
    const value = saved?.groups.find(row => String(row.groupId) === String(group.groupId));
    const valid = value && typeof value.enabled === 'boolean' && typeof value.wildMode === 'boolean' &&
      typeof value.stickersEnabled === 'boolean' && Number.isInteger(value.spice) && value.spice >= 0 && value.spice <= 3;
    return {groupId: String(group.groupId), settingsKnown: !!valid || (!saved && warnings.length === 0),
      enabled: valid ? value.enabled : config.enabledOnStart === true,
      wildMode: valid ? value.enabled && value.wildMode : false,
      spice: valid ? value.spice : config.behavior.spice,
      stickersEnabled: valid ? value.stickersEnabled : config.media?.stickersEnabled === true};
  });
  const data = {checkedAt: new Date().toISOString(), listenerRunning: listenerRunning === true,
    online: null, accountMatches: null, groups, warnings, error: ''};
  try {Object.assign(data, await query(config));}
  catch (error) {data.error = error.message;}
  return data;
}
