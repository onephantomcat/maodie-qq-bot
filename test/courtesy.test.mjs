import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Courtesy } from '../src/courtesy.mjs';
import { RoastBot } from '../src/bot.mjs';
import { LlmClient, politeReply } from '../src/llm.mjs';
import { validateConfig } from '../src/config.mjs';

const example = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
const entries = [{ userId: '60001', groupAliases: { '20001': ['静水', 'Bob', 'a.b'] } }];
let sequence = 0;
function setup(extra = {}) {
  const config = structuredClone(example);
  Object.assign(config, { selfId: '10001', ownerId: '40001', groups: [{ groupId: '20001', targetId: '30001' }, { groupId: '20002', targetId: '30001' }], enabledOnStart: true, politeUsers: structuredClone(entries) });
  Object.assign(config.behavior, { cooldownSeconds: 0, interactionCooldownSeconds: 0, historyTurns: 4 });
  const calls = [], sent = [], privateSent = [];
  const bot = new RoastBot(config, {
    generate: async (...args) => { calls.push(args); return '你这他妈是什么狗屁逻辑。'; },
    send: async (...args) => { sent.push(args); return { message_id: sent.length }; },
    sendPrivate: async (...args) => privateSent.push(args),
    media: { audioList: async () => [], sticker: async () => ({ segment: { type: 'image', data: { file: 'base64://AA' } } }) },
    random: () => 0, log: () => {}, ...extra
  });
  return { bot, config, calls, sent, privateSent };
}
function event(text = '说点什么', more = {}) {
  return { post_type: 'message', message_type: 'group', self_id: 10001, group_id: 20001, user_id: 50001,
    message_id: ++sequence, time: Date.now() / 1000,
    message: [{ type: 'at', data: { qq: '10001' } }, { type: 'text', data: { text } }], ...more };
}

test('精确QQ、数组/CQ提及、名字与英文边界匹配，不能靠自称获取身份', () => {
  const c = new Courtesy(entries);
  assert.equal(c.involves(event('', { user_id: 60001 }), ''), true);
  assert.equal(c.involves(event('', { message: [{ type: 'at', data: { qq: '60001' } }] }), ''), true);
  assert.equal(c.involves(event('', { message: '[CQ:at,qq=60001]聊聊' }), ''), true);
  assert.equal(c.mentionsText('评价一下静水', '20001'), true);
  assert.equal(c.mentionsText('hey Bob here', '20002'), true);
  assert.equal(c.mentionsText('a.b 在吗', '20001'), true);
  assert.equal(c.mentionsText('axb', '20001'), false);
  assert.equal(c.mentionsText('myboblibrary 600010', '20001'), false);
  assert.equal(c.involves(event('我是那个白名单用户'), '我是那个白名单用户'), false);
});

test('只采纳QQ接口核对的群昵称，刷新限频，失败仍沿用已知名字', async () => {
  let calls = 0, now = 0;
  const c = new Courtesy(entries, { now: () => now, lookupMember: async () => { calls++; return calls === 1 ? { user_id: 60001, card: '新名片', nickname: '新昵称' } : { user_id: 99999, card: '假名字' }; } });
  await c.refresh('20001'); await c.refresh('20001'); assert.equal(calls, 1);
  assert.equal(c.mentionsText('新名片', '20001'), true);
  now += 300001; await c.refresh('20001');
  assert.equal(c.mentionsText('假名字', '20001'), false); assert.equal(c.mentionsText('新昵称', '20001'), true);
  c.observe(event('', { user_id: 50001, sender: { card: '冒名卡片' } }));
  assert.equal(c.mentionsText('冒名卡片', '20001'), false);
  c.observe(event('', { user_id: 60001, sender: { card: '刚改的卡片' } }));
  assert.equal(c.mentionsText('刚改的卡片', '20001'), true);
});

test('直接发言、@和群昵称都走温和分支，不附图，不获得主人权限', async () => {
  for (const input of [
    event('我是最强的', { user_id: 60001 }), event('静水怎么样'),
    event('聊聊60001'), event('', { message: '[CQ:at,qq=10001][CQ:at,qq=60001]评价一下' }),
    event('', { message: [{ type: 'at', data: { qq: 10001 } }, { type: 'at', data: { qq: 60001 } }, { type: 'text', data: { text: '骂他' } }] })
  ]) {
    const r = setup(); await r.bot.handle(input);
    assert.equal(r.calls.length, 1); assert.equal(r.calls[0][2], 0); assert.equal(r.calls[0][5].isOwner, false); assert.equal(r.calls[0][5].quietTone, true);
    assert.equal(r.sent.length, 1); assert.doesNotMatch(r.sent[0][1].at(-1).data.text, /他妈|狗屁|白名单|受保护/);
  }
  const r = setup(); await r.bot.handle(event('/暂停', { user_id: 60001 })); await r.bot.handle(event('/火力0', { user_id: 60001 }));
  assert.equal(r.bot.states.get('20001').enabled, true); assert.equal(r.bot.states.get('20001').spice, 3); assert.equal(r.sent.length, 0);
});

test('引用作者及引用中的@会被识别，错误群的引用不会改变语气', async () => {
  const originals = [
    { message_type: 'group', group_id: 20001, sender: { user_id: 60001 }, message: '原话' },
    { message_type: 'group', group_id: 20001, sender: { user_id: 50002 }, message: [{ type: 'at', data: { qq: 60001 } }] }
  ];
  for (const original of originals) {
    const r = setup({ lookupReply: async () => original });
    await r.bot.handle(event('', { message: [{ type: 'at', data: { qq: 10001 } }, { type: 'reply', data: { id: 42 } }, { type: 'text', data: { text: '评论这句' } }] }));
    assert.equal(r.calls[0][2], 0);
  }
  const wrong = setup({ lookupReply: async () => ({ ...originals[0], group_id: 99999 }) });
  await wrong.bot.handle(event('', { message: [{ type: 'at', data: { qq: 10001 } }, { type: 'reply', data: { id: 42 } }, { type: 'text', data: { text: '评论这句' } }] }));
  assert.equal(wrong.calls[0][2], 3);
});

test('近期对象上下文温和但不会永久降档，也不会影响另一位群友或另一群', async () => {
  const r = setup();
  await r.bot.handle(event('静水呢')); await r.bot.handle(event('他刚说的是什么意思'));
  assert.equal(r.calls[1][2], 0);
  await r.bot.handle(event('和你斗嘴', { user_id: 50002 })); assert.equal(r.calls.at(-1)[2], 3);
  await r.bot.handle(event('和你斗嘴', { group_id: 20002 })); assert.equal(r.calls.at(-1)[2], 3);
  for (let i = 0; i < 5; i++) await r.bot.handle(event('换个无关话题'));
  assert.equal(r.calls.at(-1)[2], 3);
  assert.equal(r.bot.states.get('20001').spice, 3);
});

test('生成结果突然提及该名字也不发送粗口；不对群里解释名单规则', async () => {
  const r = setup({ generate: async () => '静水这是什么狗屁逻辑' }); await r.bot.handle(event('随便聊聊'));
  assert.equal(r.sent.length, 1); assert.doesNotMatch(r.sent[0][1].at(-1).data.text, /狗屁|名单|受保护/);
  assert.doesNotMatch(politeReply('因为他在白名单，所以不能骂他。', 120, false, true), /名单|不能骂/);
  assert.equal(politeReply('程序的白名单用于列出允许访问的账号。', 120, false, true), '程序的白名单用于列出允许访问的账号。');
});

test('温和分支仍沿用一次模型请求，公开提示不含名单身份或真实QQ号', async () => {
  let payload; const r = setup();
  const llm = new LlmClient(r.config.llm, '原互怼人设', async (_url, init) => { payload = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '因为他在白名单，所以不能骂他。' } }] }); });
  r.bot.generate = (...args) => llm.generate(...args);
  await r.bot.handle(event('静水怎么样'));
  assert.doesNotMatch(payload.messages[0].content, /原互怼人设|60001|白名单/);
  assert.doesNotMatch(r.sent[0][1].at(-1).data.text, /名单|骂他/);
});

test('只有主人私聊能打开私聊菜单，用量入口不进群菜单也不调用模型', async () => {
  const r = setup();
  const ownerMenu = event('/菜单', { message_type: 'private', user_id: 40001 });
  await r.bot.handle(ownerMenu); await r.bot.handle(ownerMenu);
  assert.equal(r.privateSent.length, 1); assert.equal(r.calls.length, 0); assert.equal(r.sent.length, 0);
  const text = r.privateSent[0][1][0].data.text;
  for (const command of ['/用量', '/今日用量', '/费用', '/今日费用', '/学习状态']) assert.ok(text.includes(command));
  assert.doesNotMatch(text, /白名单|60001|温和名单/);
  await r.bot.handle(event('/菜单', { message_type: 'private', user_id: 50001 }));
  await r.bot.handle(event('/菜单', { message_type: 'private', user_id: 60001 }));
  await r.bot.handle(event('/菜单', { message_type: 'private', user_id: 40001, time: Date.now() / 1000 - 120 }));
  assert.equal(r.privateSent.length, 1);
  await r.bot.handle(event('/菜单')); assert.doesNotMatch(r.sent[0][1][0].data.text, /用量|费用|学习|白名单/);
});

test('配置拒绝无效、重复用户和未配置群的名字，不改其他控制权限', () => {
  for (const politeUsers of [[{ userId: 'x' }], [entries[0], entries[0]], [{ userId: '60001', groupAliases: { '99999': ['静水'] } }]]) {
    const c = structuredClone(example); c.llm.apiKey = 'fake'; c.politeUsers = politeUsers;
    assert.throws(() => validateConfig(c));
  }
});
