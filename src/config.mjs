import { readFile } from 'node:fs/promises';

export function validateConfig(c) {
  const id = x => typeof x === 'string' && /^[1-9]\d{4,15}$/.test(x);
  const fail = message => { throw new Error(message); };
  if (c.displayName != null && (typeof c.displayName !== 'string' || !c.displayName.trim() || c.displayName.length > 20)) fail('displayName 应为 1 到 20 字的名称');
  if (c.media != null) {
    if (typeof c.media.stickersEnabled !== 'boolean') fail('media.stickersEnabled 必须是布尔值');
    if (!Number.isFinite(c.media.stickerProbability) || c.media.stickerProbability < 0 || c.media.stickerProbability > 1) fail('stickerProbability 应为 0 到 1');
    for (const name of ['audioDirectory', 'stickerDirectory']) if (typeof c.media[name] !== 'string') fail(`media.${name} 应为本机目录字符串`);
  }
  if(c.features!=null){
    if(typeof c.features!=='object'||Array.isArray(c.features)||typeof c.features.enabled!=='boolean'||typeof c.features.imageOcr!=='boolean')fail('features.enabled 与 imageOcr 必须为布尔值');
    if(!Number.isInteger(c.features.mergeWindowMs)||c.features.mergeWindowMs<0||c.features.mergeWindowMs>2000)fail('mergeWindowMs 应为0到2000毫秒');
    if(typeof c.features.ocrPython!=='string'||!c.features.ocrPython.trim())fail('ocrPython 应为本机Python命令或路径');
  }
  if (!id(c.selfId)) fail('selfId 必须是字符串格式的小号 QQ 号');
  if (!Array.isArray(c.groups) || !c.groups.length) fail('至少配置一个群和一个目标机器人');
  const groups = new Set();
  for (const g of c.groups) {
    if (!id(g.groupId) || !id(g.targetId) || g.targetId === c.selfId) fail('群号或目标 QQ 号无效，目标不能是自己');
    if (groups.has(g.groupId)) fail('同一个群只能设置一个目标机器人');
    groups.add(g.groupId);
  }
  if (!id(c.ownerId)) fail('ownerId 必须是唯一控制人的 QQ 号字符串');
  if (c.groups.some(g => c.ownerId === g.targetId)) fail('目标机器人不能同时是控制人');
  if (c.politeUsers != null) {
    if (!Array.isArray(c.politeUsers) || c.politeUsers.length > 50) fail('politeUsers 必须是最多50项的数组');
    const people = new Set();
    for (const entry of c.politeUsers) {
      if (!id(entry?.userId) || people.has(entry.userId)) fail('politeUsers 中的QQ号必须有效且不重复');
      people.add(entry.userId);
      if (entry.groupAliases != null && (typeof entry.groupAliases !== 'object' || Array.isArray(entry.groupAliases))) fail('groupAliases 必须按群号配置');
      for (const [groupId, names] of Object.entries(entry.groupAliases || {})) {
        if (!groups.has(groupId) || !Array.isArray(names) || names.length > 30 || names.some(x => typeof x !== 'string' || !x.trim() || x.length > 80)) fail('groupAliases 中的群号或名称无效');
      }
    }
  }
  let ws, api;
  try { ws = new URL(c.onebot.url); api = new URL(c.llm.baseUrl); }
  catch { fail('OneBot 或模型接口地址格式不正确'); }
  if (!['ws:', 'wss:'].includes(ws.protocol)) fail('OneBot 地址应以 ws:// 或 wss:// 开头');
  if (!['http:', 'https:'].includes(api.protocol)) fail('模型地址应以 https:// 开头');
  if (api.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)) fail('远程模型接口必须使用 HTTPS');
  if (api.username || api.password || api.search || api.hash) fail('模型地址不要包含账号、查询参数或片段');
  if (ws.username || ws.password || ws.search || ws.hash) fail('OneBot token 请单独填写，不要放在 URL 中');
  if (!String(c.llm.apiKey || '').trim()) fail('缺少 API Key，请双击“配置机器人.cmd”在本机填写');
  if (!String(c.llm.model || '').trim()) fail('缺少模型 ID');
  if (c.llm.thinkingType != null && !['enabled', 'disabled'].includes(c.llm.thinkingType)) fail('thinkingType 应为 enabled 或 disabled');
  if (typeof c.onebot.token !== 'string') fail('onebot.token 必须是字符串');
  if (typeof c.enabledOnStart !== 'boolean') fail('enabledOnStart 必须是布尔值');
  for (const name of ['mentionTarget', 'requireAtSelf']) {
    if (typeof c.behavior?.[name] !== 'boolean') fail(`behavior.${name} 必须是布尔值`);
  }
  if (c.behavior.respondToInteractions != null && typeof c.behavior.respondToInteractions !== 'boolean') fail('respondToInteractions 必须是布尔值');
  if (c.behavior.interactionCooldownSeconds != null && (!Number.isInteger(c.behavior.interactionCooldownSeconds) || c.behavior.interactionCooldownSeconds < 1 || c.behavior.interactionCooldownSeconds > 60)) fail('interactionCooldownSeconds 应为 1 到 60 的整数');
  if (c.behavior.wildReplyProbability != null && (!Number.isFinite(c.behavior.wildReplyProbability) || c.behavior.wildReplyProbability < 0 || c.behavior.wildReplyProbability > 1)) fail('wildReplyProbability 应为 0 到 1');
  if (c.behavior.maxInputChars != null && (!Number.isInteger(c.behavior.maxInputChars) || c.behavior.maxInputChars < 50 || c.behavior.maxInputChars > 4000)) fail('maxInputChars 应为 50 到 4000');
  const ranges = {
    cooldownSeconds: [1, 3600], historyTurns: [0, 20],
    maxReplyChars: [20, 500], eventMaxAgeSeconds: [5, 300], spice: [0, 3]
  };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const value = c.behavior?.[name];
    if (!Number.isInteger(value) || value < min || value > max) fail(`behavior.${name} 应为 ${min} 到 ${max} 的整数`);
  }
  if (!Number.isFinite(c.llm.temperature) || c.llm.temperature < 0 || c.llm.temperature > 2) fail('temperature 应为 0 到 2');
  if (!Number.isInteger(c.llm.maxTokens) || c.llm.maxTokens < 64 || c.llm.maxTokens > 8192) fail('maxTokens 应为 64 到 8192');
  if (!Number.isInteger(c.llm.timeoutMs) || c.llm.timeoutMs < 1000 || c.llm.timeoutMs > 180000) fail('timeoutMs 应为 1000 到 180000');
  return c;
}

export async function loadConfig(path) {
  let c;
  try { c = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('无法读取 config.local.json，请先运行“配置机器人.cmd”，并检查 JSON 格式'); }
  if (process.env.DSAPI_API_KEY) c.llm.apiKey = process.env.DSAPI_API_KEY;
  if (process.env.ONEBOT_TOKEN) c.onebot.token = process.env.ONEBOT_TOKEN;
  return validateConfig(c);
}
