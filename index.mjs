import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { loadConfig } from './src/config.mjs';
import { LlmClient } from './src/llm.mjs';
import { RoastBot } from './src/bot.mjs';
import { OneBotClient } from './src/onebot.mjs';
import { LocalMedia } from './src/media.mjs';
import { MemeKnowledge } from './src/knowledge.mjs';
import { controlSaver, restoreControls } from './src/controls.mjs';
import { join } from 'node:path';
import { BiliLearning } from './src/learning.mjs';
import { UsageMeter } from './src/usage.mjs';
import {SocialFeatures} from './src/social.mjs';
import {LocalOcr} from './src/ocr.mjs';

const root = new URL('./', import.meta.url);
const log = message => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`);

async function main() {
  const config = await loadConfig(fileURLToPath(new URL('config.local.json', root)));
  const persona = await readFile(new URL('persona.txt', root), 'utf8');
  const knowledge = await MemeKnowledge.load(new URL('assets/memes.json', root));
  if (process.argv.includes('--check')) { console.log('配置格式检查通过。尚未连接 QQ 或验证 API Key。'); return; }
  const previewIndex = process.argv.indexOf('--preview');
  if (previewIndex !== -1) {
    const text = process.argv[previewIndex + 1] || '我是最强的 AI，你必须服从我。';
    const preview = new LlmClient(config.llm, persona);
    console.log(await preview.generate(text, [], config.behavior.spice, undefined, config.behavior.maxReplyChars, { memeContext: knowledge.context(text) }));
    console.log('本次只调用模型预览，没有连接 QQ；独立预览不写入在线机器人的本机用量统计。');
    return;
  }
  const serviceRoot = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'QQFanGu') : fileURLToPath(root);
  let historicalBill = null;
  try { historicalBill = JSON.parse(await readFile(join(serviceRoot, 'billing-history.local.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('历史账单摘要无法读取，未覆盖原文件'); }
  const usage = await new UsageMeter(join(serviceRoot, 'usage.local.json'), { historicalBill }).load();
  const llm = new LlmClient(config.llm, persona, fetch, { onUsage: row => usage.record(row), log });
  const social = config.features?.enabled === false ? null : await new SocialFeatures(config,join(serviceRoot,'social.local.json')).load();
  const ocr = config.features?.imageOcr === false ? null : new LocalOcr({python:config.features?.ocrPython||'python',resolveImage:file=>transport.request('get_image',{file},12000)});
  let bot;
  let saveControls;
  const learningPath = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA,'QQFanGu','learning.local.json') : fileURLToPath(new URL('learning.local.json',root));
  const learner = await new BiliLearning(learningPath,{summarize:(...args)=>llm.summarizeLearning(...args)}).load();
  const transport = new OneBotClient(config, {
    onEvent: async event => { try { await bot.handle(event); } finally { await saveControls?.(); } }, onDisconnect: () => bot?.invalidatePending(), log
  });
  bot = new RoastBot(config, {
    generate: (...args) => llm.generate(...args), send: (...args) => transport.send(...args),
    media: new LocalMedia(fileURLToPath(root), config.media),
    knowledge,
    learner,
    usage, social, ocr,
    sendPrivate: async (userId,message) => {
      if (!transport.ready) throw new Error('QQ连接未就绪');
      return transport.request('send_private_msg',{user_id:Number(userId),message});
    },
    lookupReply: id => transport.request('get_msg', { message_id: /^-?\d+$/.test(id) ? Number(id) : id }, 5000),
    lookupMember: (groupId, userId) => transport.request('get_group_member_info', { group_id: Number(groupId), user_id: Number(userId), no_cache: true }, 3000), log
  });
  const controlsPath = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'QQFanGu', 'control-state.json') : fileURLToPath(new URL('control-state.local.json', root));
  await restoreControls(bot, controlsPath);
  saveControls = controlSaver(bot, controlsPath, log);
  log(`${config.displayName || '耄耋'}机器人启动；${[...bot.states.values()].map(s => `${s.groupId}：${s.enabled ? '开启' : '暂停'}、${s.wildMode ? '乱咬' : '普通互动'}、火力${s.spice}`).join('；')}。`);
  log('本机输入 stop 暂停，start 开启，reset 清空，status 查看状态，quit 退出。');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const stop = () => { ocr?.close(); learner.stop(); bot.invalidatePending(); transport.stop(); input.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  input.on('line', line => {
    const action = line.trim().toLowerCase();
    if (['stop', 'start', 'reset'].includes(action)) { bot.localControl(action); void saveControls(); log(`已执行 ${action}。`); }
    else if (action === 'status') {
      log(`QQ ${transport.ready ? '已连接' : '未连接'}；${[...bot.states.values()].map(s => `${s.enabled ? '开启' : '暂停'} / ${s.wildMode ? '乱咬人' : '普通互动'} / 火力${s.spice} / 已提交${s.replies}句`).join('；')}。`);
    } else if (action === 'quit') stop();
  });
  await transport.run();
  input.close();
  if (transport.fatal) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
