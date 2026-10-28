import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MemeKnowledge } from '../src/knowledge.mjs';
import { LlmClient, politeReply } from '../src/llm.mjs';

const knowledge = await MemeKnowledge.load(new URL('../assets/memes.json', import.meta.url));

test('扩展联想覆盖热梗变体与拼音，大小写及字间空格可识别，但不截取英文单词', () => {
  for (const [text, meaning] of [
    ['帽叠你在吗', '耄耋'], ['哈鸡米来了', '哈基米'], ['HJM来一个', '哈基米'],
    ['h a j i m i', '哈基米'], ['你又哈汽了', '哈气'], ['慢波慢波', '曼波'],
    ['manbo!', '曼波'], ['hongwen了', '红温'], ['这事包滴', '包的'],
    ['那咋嘞', '那咋了'], ['NZL?', '那咋了'], ['何意为啊', '何意味'],
    ['HYW?', '何意味'], ['已佬实', '已老实求放过'], ['QFG', '已老实求放过'],
    ['这视频把我应控住了', '硬控']
  ]) assert.ok(knowledge.interpret(text).some(x => x.canonical === meaning), text);
  for (const text of ['myhjmlib', 'somehajimifile', 'manbotest', 'nzltest', 'testhywcode']) assert.equal(knowledge.interpret(text).length, 0, text);
});

test('扩大词表后不把正常科学、商品和加工讨论强行当成梗', () => {
  for (const text of ['慢波睡眠与深睡有关吗', '这种红蚊是什么昆虫', '调节烘箱的烘温', '曼波舞的舞步怎么学', '包滴在包裹里面了', '数控机加工的硬孔孔径', '哈汽集团的汽轮机', '我看见猫了', '他突然哈哈起来', '以老实为原则']) assert.equal(knowledge.interpret(text).length, 0, text);
  const context=knowledge.context('HJM 慢波 红闻 包滴 NZL HYW QFG 应控');
  assert.ok([...context].length <= 400);
  assert.ok(context.split('\n').length <= 3);
});

test('谐音联想保留原语境，称呼键帽能联想贱猫，硬件讨论按字面理解', () => {
  for (const text of ['键帽你给我出来', '键 猫又哈气了', '键-帽', '贱喵你在吗']) assert.match(knowledge.context(text), /贱猫/);
  for (const text of ['这个键帽用的PBT材质吗', '机械键盘换键帽怎么拆', '键帽多少钱', '我的键帽掉了', '键帽怎么清洗']) {
    assert.equal(knowledge.interpret(text).length, 0);
    assert.doesNotMatch(knowledge.context(text), /贱猫/);
  }
  assert.match(knowledge.context('耄碟出来'), /耄耋/);
  assert.match(knowledge.context('哈基咪哈基咪'), /哈基米/);
  assert.match(knowledge.lookup('键帽'), /键帽 → 贱猫/);
  assert.ok([...knowledge.context('键帽 耄碟 哈基咪 红温 包的 曼波')].length <= 400);
});

test('本地匹配识别别名和标点，背景最多3条400字符，不匹配单字或未知词', () => {
  assert.match(knowledge.context('哈吉米！！！'), /哈基米/);
  assert.match(knowledge.context('H A J I M I'), /哈基米/);
  assert.equal(knowledge.context('哈哈 包子 今天忙'), '');
  assert.equal(knowledge.context('今天写作业'), '');
  const text = knowledge.context(knowledge.entries.map(x => x.name).join(' '));
  assert.ok([...text].length <= 400);
  assert.ok(text.split('\n').length <= 3);
  assert.match(knowledge.lookup('红温'), /https:\/\/www.bilibili.com/);
  assert.equal(knowledge.entries.length, 10);
});

test('礼貌人设排除辱骂历史，梗背景有上限，思考仍关闭', async () => {
  const config = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
  const requests = [];
  const llm = new LlmClient(config.llm, '嘴臭、他妈的、装逼', async (url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({ choices: [{ message: { content: '主人，包的，我在认真听。' } }] });
  });
  await llm.generate('包的', [{ role: 'assistant', content: '你他妈放什么狗屁' }], 2, undefined, 60, { isOwner: true, memeContext: '梗'.repeat(800) });
  const body = requests[0];
  assert.equal(body.messages.length, 2);
  assert.doesNotMatch(body.messages[0].content, /嘴臭|装逼|旧记录/);
  assert.match(body.messages[0].content, /程序核对QQ号后的主人/);
  assert.ok(body.messages[0].content.length < 800);
  assert.equal(body.max_tokens, 320); assert.equal(body.thinking.type, 'disabled');
  await llm.generate('包的', [], 0, undefined, 60);
  assert.match(requests[1].messages[0].content, /温和礼貌/);
  assert.doesNotMatch(requests[1].messages[0].content, /当前发言人.*主人/);
});

test('礼貌输出本地兜底能拦截粗口、间隔字符和常见挖苦，而保留正常回答', () => {
  for (const text of ['主人你这逻辑是随机数拼的', '傻 逼', '他，妈，的', '你也配？', '脑子进水了吧']) assert.match(politeReply(text, 60, true), /^主人，我在/);
  assert.equal(politeReply('主人，天气凉了，记得添衣。', 60, true), '主人，天气凉了，记得添衣。');
  assert.equal(politeReply('曼波～愿你今天开心！', 60), '曼波～愿你今天开心！');
  for(const text of ['浏览器卡住时试试上下滚动页面。','JavaScript的垃圾回收会自动管理部分内存。','这道题是关于垃圾分类的。','I want to help you.','你这逻辑需要先判断空值。']) assert.equal(politeReply(text,120,true),text);
});

test('礼貌回复保留正常前文与最近措辞，避免每次从头套模板',async()=>{
  let request;
  const c=JSON.parse(await readFile(new URL('../config.example.json',import.meta.url),'utf8'));
  const llm=new LlmClient(c.llm,'原人设',async(url,init)=>{request=JSON.parse(init.body);return Response.json({choices:[{message:{content:'还差两张图。'}}]});});
  const history=[{role:'user',content:'我还差两张图'},{role:'assistant',content:'先把最重要的一张画好。'}];
  await llm.generate('我还差几张？',history,0,undefined,120,{isOwner:true});
  assert.deepEqual(request.messages.slice(1,-1),history);
  assert.match(request.messages[0].content,/避免复用刚说过/);
});
