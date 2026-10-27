import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LlmClient, politeReply} from '../src/llm.mjs';

const example = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
const persona = await readFile(new URL('../persona.txt', import.meta.url), 'utf8');

function rig(reply = '爪子在忙，耳朵可一直没下班。') {
  const requests = [];
  const llm = new LlmClient(example.llm, persona, async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({choices: [{message: {content: reply}}]});
  });
  return {llm, requests};
}

test('1与2档使用反骨猫人设，不混入3档粗口样句，每轮仍只请求一次', async () => {
  const {llm, requests} = rig();
  await llm.generate('你能不能正常点', [], 1, undefined, 120);
  await llm.generate('你刚才还说不理我', [], 2, undefined, 120);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.match(request.messages[0].content, /嘴硬装傻/);
    assert.match(request.messages[0].content, /本轮的具体词/);
    assert.doesNotMatch(request.messages[0].content, /他妈的|装逼|报错了还给自己弹/);
    assert.equal(request.max_tokens, 320);
    assert.equal(request.thinking.type, 'disabled');
    assert.equal(request.messages.length, 2);
  }
  assert.match(requests[0].messages[0].content, /不说粗口/);
  assert.match(requests[1].messages[0].content, /少量说“屁话”“扯淡”/);
});

test('3档保留原有嘴臭人设与具体反击要求，主人及0档使用温和撒娇分支', async () => {
  const {llm, requests} = rig();
  await llm.generate('你只会附和', [], 3, undefined, 120);
  await llm.generate('你又偷懒', [], 3, undefined, 120, {isOwner: true});
  await llm.generate('摸摸猫头', [], 0, undefined, 120);
  assert.ok(requests[0].messages[0].content.startsWith(persona));
  assert.match(requests[0].messages[0].content, /嘴臭加强档|自然带1到2处口头粗话/);
  for (const request of requests.slice(1)) {
    assert.match(request.messages[0].content, /装傻撒娇/);
    assert.match(request.messages[0].content, /认真求助/);
    assert.doesNotMatch(request.messages[0].content, /嘴臭加强档|他妈的|装逼/);
  }
  assert.match(requests[1].messages[0].content, /程序核对QQ号后的主人/);
  assert.doesNotMatch(requests[2].messages[0].content, /程序核对QQ号后的主人/);
});

test('俏皮猫式辩解可以通过温和输出检查，辱骂和攻击仍被拦截', () => {
  for (const text of ['我没偷懒，爪子只是在等脑袋发话喵。', '好嘛，摸摸头就告诉你。', '我在认真听，耳朵都竖好了。']) {
    assert.equal(politeReply(text, 120, true), text);
  }
  for (const text of ['你他妈闭嘴', '你也配', '主人你这逻辑是随机数拼的']) {
    assert.match(politeReply(text, 120, true), /^主人，我在/);
    assert.doesNotMatch(politeReply(text, 120, true), /闭嘴|你也配|随机数/);
  }
});
