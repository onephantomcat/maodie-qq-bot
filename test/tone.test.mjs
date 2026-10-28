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

test('1档嘴硬、2档孙吧抽象，每轮仍只请求一次', async () => {
  const {llm, requests} = rig();
  await llm.generate('你能不能正常点', [], 1, undefined, 120);
  await llm.generate('你刚才还说不理我', [], 2, undefined, 120);
  assert.equal(requests.length, 2);
  assert.match(requests[0].messages[0].content, /嘴硬/);
  assert.match(requests[0].messages[0].content, /不带脏字/);
  assert.doesNotMatch(requests[0].messages[0].content, /他妈的|你爹|没妈/);
  assert.match(requests[1].messages[0].content, /孙吧抽象/);
  assert.match(requests[1].messages[0].content, /钓鱼|你爹|乐子|穷屌丝/);
  assert.match(requests[1].messages[0].content, /典|急|难绷/);
  assert.doesNotMatch(requests[1].messages[0].content, /他妈的|嘴臭档|3档接法/);
  for (const request of requests) {
    assert.equal(request.max_tokens, 320);
    assert.equal(request.thinking.type, 'disabled');
    assert.equal(request.messages.length, 2);
  }
});

test('3档使用孙吧嘴臭人设；主人3档另用没大没小分支；主人1/2档仍温和；0档撒娇', async () => {
  const {llm, requests} = rig();
  await llm.generate('你只会附和', [], 3, undefined, 120);
  await llm.generate('你又偷懒', [], 2, undefined, 120, {isOwner: true});
  await llm.generate('骂我', [], 3, undefined, 120, {isOwner: true});
  await llm.generate('摸摸猫头', [], 0, undefined, 120);
  assert.ok(requests[0].messages[0].content.startsWith(persona));
  assert.match(requests[0].messages[0].content, /嘴臭|没妈|浮木|他妈的/);
  assert.match(requests[0].messages[0].content, /3档接法/);
  assert.match(requests[1].messages[0].content, /装傻撒娇/);
  assert.doesNotMatch(requests[1].messages[0].content, /孙吧|他妈的/);
  assert.match(requests[2].messages[0].content, /主人3档接法/);
  assert.match(requests[2].messages[0].content, /称呼固定用“主人”，不用“爸爸”/);
  assert.doesNotMatch(requests[2].messages[0].content, /没妈|浮木/);
  assert.match(requests[3].messages[0].content, /装傻撒娇/);
  assert.doesNotMatch(requests[3].messages[0].content, /孙吧|嘴臭/);
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


test('隐藏温和标记优先于3档，短提示不塞定型辱称和京腔样句',async()=>{
 const {llm,requests}=rig('收到。');
 await llm.generate('这是什么',[],3,undefined,120,{quietTone:true});
 assert.match(requests[0].messages[0].content,/温和礼貌/);
 assert.doesNotMatch(requests[0].messages[0].content,/嘴臭档|3档接法/);
 for(const spice of [1,2,3])await llm.generate('你又迟到了',[],spice,undefined,120);
 for(const req of requests.slice(1)){
   assert.match(req.messages[0].content,/自然普通话/);
   assert.ok(req.messages[0].content.length<1100);
   assert.doesNotMatch(req.messages[0].content,/孙吧嘴臭老哥人格|太带派了|一刀砍成两半|穷屌丝充不起直说/);
 }
});
