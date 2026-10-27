import {join} from 'node:path';
import {getDashboard} from './status-data.mjs';
const json = process.argv.includes('--json');
try {
  const result = await getDashboard({configPath: new URL('../config.local.json', import.meta.url),
    controlsPath: join(process.env.LOCALAPPDATA, 'QQFanGu', 'control-state.json'),
    listenerRunning: !process.argv.includes('--listener-stopped')});
  if (json) console.log(JSON.stringify(result));
  else {
    if (result.accountMatches === false) throw new Error('登录账号不匹配');
    if (result.error) throw new Error(result.error);
    console.log(`QQ账号匹配；${result.online ? '在线' : '离线'}`);
    for (const state of result.groups) console.log(`群 ${state.groupId}：${state.enabled ? '开启' : '暂停'} / 火力${state.spice} / ${state.wildMode ? '乱咬开启' : '普通互动'}`);
    if (result.warnings.length) throw new Error(result.warnings.join('；'));
    if (!result.online) process.exitCode = 1;
  }
} catch {
  if (json) console.log(JSON.stringify({listenerRunning: false, online: null, accountMatches: null,
    groups: [], warnings: [], error: '状态读取失败，请检查本机配置后重试', checkedAt: new Date().toISOString()}));
  else {console.error('QQ状态读取失败，请检查本机登录服务和配置');process.exitCode = 1;}
}
