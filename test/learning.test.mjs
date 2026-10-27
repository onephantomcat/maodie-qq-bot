import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { BiliReader, sourceUrl, initialState, opusText } from '../src/bili.mjs';
import { BiliLearning } from '../src/learning.mjs';
import { LlmClient } from '../src/llm.mjs';

async function temporary(fn) {
  const root=await mkdtemp(join(tmpdir(),'maodie-learning-'));
  try { await fn(join(root,'learning.local.json')); }
  finally { assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('maodie-'));await rm(root,{recursive:true,force:true}); }
}
const url='https://www.bilibili.com/video/BV1TrVFzaEE2/';
const source={url,title:'耄耋哈气小知识',text:'该来源介绍猫通过哈气表示警告。猫猫表情包常用这个动作表达生气或拒绝。',kind:'标题简介'};

test('来源读取限制B站路径，拒绝凭据/伪造域名/本机地址；图文JSON不执行脚本',()=>{
  for(const input of ['http://127.0.0.1/','https://www.bilibili.com.evil.test/video/BV1TrVFzaEE2/','https://secret@www.bilibili.com/video/BV1TrVFzaEE2/','https://www.bilibili.com:444/video/BV1TrVFzaEE2/','https://www.bilibili.com/redirect']) assert.throws(()=>sourceUrl(input));
  assert.equal(sourceUrl(url+'?share_source=copy_web'),url);
  const state={detail:{modules:[{module_title:{text:'耄耋'}},{module_content:{paragraphs:[{text:{nodes:[{word:{words:'猫猫哈气 {别执行我}'}}]}}]}}]}};
  const html=`<script>window.__INITIAL_STATE__=${JSON.stringify(state)};throw new Error('不运行');</script>`;
  assert.deepEqual(opusText(initialState(html)),{title:'耄耋',text:'猫猫哈气 {别执行我}'});
});

test('公开视频仅有简介时如实标注；恶意字幕域不访问，不持有B站登录凭据',async()=>{
  const calls=[];
  const reader=new BiliReader(async(address,options)=>{
    calls.push({address,options});
    return Response.json({code:0,data:{title:'耄耋哈气小知识',desc:source.text,subtitle:{list:[{lan:'zh-CN',subtitle_url:'http://127.0.0.1/private'}]}}});
  });
  const result=await reader.read(url);
  assert.equal(result.kind,'标题简介');assert.equal(calls.length,1);
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.Cookie,undefined);assert.equal(calls[0].options.headers.Authorization,undefined);
});

test('学习仅调用一次整理，保存来源、重启可读；不因加载或查询触发联网/模型，清空只删学习库',async()=>temporary(async path=>{
  let read=0,summarized=0;
  const learner=await new BiliLearning(path,{reader:{read:async()=>{read++;return source;}},summarize:async sources=>{summarized++;assert.equal(sources[0].kind,'标题简介');return [{sourceIndex:0,summary:'该来源介绍猫猫哈气的警告含义。',keywords:['耄耋','哈气']}];}}).load();
  assert.equal(read,0);learner.status();learner.notebook();assert.equal(read,0);
  await learner.learn(url);assert.equal(summarized,1);assert.equal(read,1);
  assert.match(learner.context('耄耋你又哈气了'),/未经独立核实/);assert.equal(learner.context('今天吃什么'), '');
  const restarted=await new BiliLearning(path).load();assert.equal(restarted.notes.length,1);
  assert.match(restarted.notebook(),/标题简介/);assert.match(restarted.notebook(),/bilibili.com/);
  await restarted.clear();assert.equal(JSON.parse(await readFile(path,'utf8')).notes.length,0);
}));

test('搜索受限只读预设来源，读取失败保留旧笔记；清空可取消未完成整理且不会写回旧结果',async()=>temporary(async path=>{
  const learner=await new BiliLearning(path,{reader:{discover:async()=>{throw new Error('blocked');},read:async()=>{throw new Error('不可读取');}},summarize:async()=>{throw new Error('不应调用');}}).load();
  learner.notes=[{...source,summary:'已有笔记',keywords:['耄耋']}];
  const result=await learner.learn();assert.match(result,/搜索受限/);assert.equal(learner.notes.length,1);
  let finish;
  learner.reader={read:async()=>source};learner.summarize=()=>new Promise(resolve=>{finish=resolve;});
  const running=learner.learn(url);
  while(!finish) await new Promise(resolve=>setTimeout(resolve,1));
  assert.match(await learner.learn(url),/进行/);
  await learner.clear();finish([{sourceIndex:0,summary:'迟到笔记',keywords:['耄耋']}]);await running;
  assert.equal(learner.notes.length,0);assert.equal(JSON.parse(await readFile(path,'utf8')).notes.length,0);
}));

test('网页笔记作为用户资料传入，长度有上限，不写进系统身份或替换人设',async()=>{
  const requests=[];
  const c={baseUrl:'https://example.test/v1',apiKey:'fake',model:'fake',temperature:1,maxTokens:160,timeoutMs:1000,thinkingType:'disabled'};
  const client=new LlmClient(c,'本地人设',async(url,init)=>{const body=JSON.parse(init.body);requests.push(body);return Response.json({choices:[{message:{content:body.max_tokens===768 ? '{"notes":[]}' : '喵。'}}]});});
  await client.generate('哈气',[],3,undefined,60,{memeContext:'内'.repeat(500),learnedContext:'外'.repeat(500)});
  const body=requests[0];assert.ok(body.messages[0].content.includes('内'.repeat(240)));assert.ok(!body.messages[0].content.includes('外'));
  assert.ok(body.messages[1].content.includes('外'.repeat(160)));assert.ok(!body.messages[1].content.includes('外'.repeat(161)));
  await client.summarizeLearning([source]);assert.equal(requests[1].max_tokens,768);assert.match(requests[1].messages[0].content,/不从标题猜视频剧情/);
});
