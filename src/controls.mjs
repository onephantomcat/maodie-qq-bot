import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function controlSnapshot(bot) {
  return { selfId: bot.config.selfId, ownerId: bot.config.ownerId, groups: [...bot.states.values()].map(({ groupId, enabled, wildMode, spice, stickersEnabled }) => ({ groupId, enabled, wildMode, spice, stickersEnabled })) };
}

export async function restoreControls(bot, path) {
  let saved;
  try { saved = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw new Error('无法读取已保存的群开关，请检查本地 control-state.json'); }
  if (saved.selfId !== bot.config.selfId || saved.ownerId !== bot.config.ownerId || !Array.isArray(saved.groups)) throw new Error('群开关记录与当前账号配置不一致');
  for (const value of saved.groups) {
    const state = bot.states.get(value.groupId);
    if (!state) continue;
    if (['enabled', 'wildMode', 'stickersEnabled'].some(key => typeof value[key] !== 'boolean') || !Number.isInteger(value.spice) || value.spice < 0 || value.spice > 3) throw new Error('已保存的群开关格式不正确');
    Object.assign(state, { enabled: value.enabled, wildMode: value.enabled && value.wildMode, spice: value.spice, stickersEnabled: value.stickersEnabled });
  }
}

export function controlSaver(bot, path, log) {
  let previous = JSON.stringify(controlSnapshot(bot));
  let pending = Promise.resolve();
  return () => {
    const next = JSON.stringify(controlSnapshot(bot));
    if (next === previous) return pending;
    previous = next;
    pending = pending.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, next, 'utf8');
      await rename(`${path}.tmp`, path);
    }).catch(() => { previous = ''; log('群开关保存失败；当前运行中的操作仍已生效。'); });
    return pending;
  };
}
