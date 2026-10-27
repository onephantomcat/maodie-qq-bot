import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {RoastBot} from '../src/bot.mjs';
import {LlmClient} from '../src/llm.mjs';
import {controlSnapshot,restoreControls} from '../src/controls.mjs';
import {visionRate} from '../src/usage.mjs';
const example=JSON.parse(await readFile(new URL('../config.example.json',import.meta.url),'utf8'));
let serial=8000;
const image={type:'image',data:{url:'https://gchat.qpic.cn/test.gif',file:'face.gif',sub_type:1}};
const event=(text='',{at=false,user=50001,type='group',images=true}={})=>({post_type:'message',message_type:type,self_id:10001,user_id:user,group_id:20001,message_id:++serial,time:Date.now()/1000,message:[...(at?[{type:'at',data:{qq:'10001'}}]:[]),{type:'text',data:{text}},...(images?[image]:[])]});
function rig({probability=.2,textProbability=0,random=()=>.1,ocr=null}={}){
 const c=structuredClone(example);Object.assign(c,{selfId:'10001',ownerId:'40001',groups:[{groupId:'20001',targetId:'30001'}]});Object.assign(c.behavior,{cooldownSeconds:0,interactionCooldownSeconds:0,wildReplyProbability:textProbability});c.features.imageProbability=probability;c.features.autoImages=true;
 const calls=[],sent=[],privateSent=[];let scans=0;
 const bot=new RoastBot(c,{ocr:ocr||{recognize:async()=>{scans++;return '图片上写着晚饭吃面';}},generate:async(...args)=>{calls.push(args);return '面条先举爪。';},send:async(group,message)=>{sent.push({group,message});return {message_id:++serial};},sendPrivate:async(user,message)=>privateSent.push({user,message}),random,log:()=>{}});
 return {bot,c,calls,sent,privateSent,scans:()=>scans,state:bot.states.get('20001')};
}

test('自动识图有独立概率，纯图片/GIF命中后读取，边界未命中不识别也不调用模型',async()=>{
 const hit=rig({random:()=>.199});await hit.bot.handle(event());assert.equal(hit.scans(),1);assert.equal(hit.calls.length,1);assert.match(hit.calls[0][0],/自然接一句|自然接话/);
 const miss=rig({random:()=>.2});await miss.bot.handle(event());assert.equal(miss.scans(),0);assert.equal(miss.calls.length,0);
 const zero=rig({probability:0,random:()=>0});await zero.bot.handle(event());assert.equal(zero.scans(),0);
 const target=rig({probability:1});await target.bot.handle(event('',{user:30001}));assert.equal(target.scans(),1);assert.equal(target.calls.length,1);
});

test('图片和文字分开抽样，同时命中只生成一次，文字命中不意味着必须识图',async()=>{
 const both=rig({probability:1,textProbability:1});both.state.wildMode=true;await both.bot.handle(event('今晚吃啥'));assert.equal(both.scans(),1);assert.equal(both.calls.length,1);
 const textOnly=rig({probability:0,textProbability:1});textOnly.state.wildMode=true;await textOnly.bot.handle(event('今晚吃啥'));assert.equal(textOnly.scans(),0);assert.equal(textOnly.calls.length,1);
});

test('概率和自动识图开关只认主人，私聊按群设置且不向群回执',async()=>{
 const r=rig();await r.bot.handle(event('/识图概率100',{images:false}));assert.equal(r.state.autoImageProbability,.2);
 await r.bot.handle(event('/识图概率 40%',{user:40001,images:false}));assert.equal(r.state.autoImageProbability,.4);
 await r.bot.handle(event('/识图概率101',{user:40001,images:false}));assert.equal(r.state.autoImageProbability,.4);
 await r.bot.handle(event('/群 20001 自动识图关闭',{user:40001,type:'private',images:false}));assert.equal(r.state.autoImageEnabled,false);
 const publicCount=r.sent.length;await r.bot.handle(event('/群 20001 识图概率75',{user:40001,type:'private',images:false}));assert.equal(r.state.autoImageProbability,.75);assert.equal(r.sent.length,publicCount);assert.match(r.privateSent.at(-1).message[0].data.text,/75%/);
 await r.bot.handle(event('/群 20001 自动识图开启',{user:50001,type:'private',images:false}));assert.equal(r.state.autoImageEnabled,false);assert.equal(r.calls.length,0);
});

test('关闭自动识图会取消正在读取的随机图片，手动识图仍可使用',async()=>{
 let finish,started;const running=new Promise(resolve=>{started=resolve;});
 const r=rig({probability:1,ocr:{recognize:async()=>{started();return new Promise(resolve=>{finish=resolve;});}}});
 const pending=r.bot.handle(event());await running;await r.bot.handle(event('/自动识图关闭',{user:40001,images:false}));finish('迟到图片文字');await pending;
 assert.equal(r.calls.length,0);assert.equal(r.state.autoImageEnabled,false);
 r.bot.ocr={recognize:async()=>'手动图片文字'};await r.bot.handle(event('/识图',{at:true}));assert.equal(r.calls.length,1);
});

test('总暂停、个人免打扰、自己发的图片和过期事件不会触发随机识图',async()=>{
 const r=rig({probability:1});r.state.enabled=false;await r.bot.handle(event());r.state.enabled=true;
 r.bot.social={isOptedOut:()=>true,observe:()=>{}};await r.bot.handle(event());r.bot.social=null;
 await r.bot.handle(event('',{user:10001}));const old=event();old.time-=200;await r.bot.handle(old);assert.equal(r.scans(),0);assert.equal(r.calls.length,0);
});

test('自动读取失败或无结果时安静略过，无字表情可走视觉输入',async()=>{
 const failed=rig({probability:1,ocr:{recognize:async()=>{throw new Error('读图失败');}}});await failed.bot.handle(event());assert.equal(failed.calls.length,0);assert.equal(failed.sent.length,0);
 const empty=rig({probability:1,ocr:{recognize:async()=>''}});await empty.bot.handle(event());assert.equal(empty.calls.length,0);assert.equal(empty.sent.length,0);
 const vision=rig({probability:1,ocr:{inspect:async()=>({text:'',imageData:'data:image/jpeg;base64,YWJj'})}});await vision.bot.handle(event());assert.equal(vision.calls.length,1);assert.equal(vision.calls[0][5].imageData,'data:image/jpeg;base64,YWJj');
});

test('群与主人私聊菜单分开，每条指令一行，费用学习仅出现在私聊',async()=>{
 const r=rig();await r.bot.menu({},r.state);const group=r.sent[0].message[0].data.text,privateMenu=r.bot.privateMenu();
 assert.match(group,/群聊菜单/);assert.match(group,/自动识图开启/);assert.match(group,/识图概率20/);assert.doesNotMatch(group,/今日费用|学习笔记|\/群 群号/);
 assert.match(privateMenu,/私聊菜单/);assert.match(privateMenu,/\/群 群号 自动识图开启/);assert.match(privateMenu,/今日费用|学习笔记/);
 for(const menu of [group,privateMenu])for(const line of menu.split('\n').filter(x=>x.startsWith('/')))assert.equal((line.match(/\//g)||[]).length,1,line);
});

test('新识图开关与概率可保存恢复，旧记录缺字段沿用新默认，不重置原群开关',async()=>{
 const root=await mkdtemp(join(tmpdir(),'maodie-image-settings-'));const path=join(root,'control.json');
 try{const r=rig();r.state.enabled=false;r.state.autoImageEnabled=false;r.state.autoImageProbability=.7;await writeFile(path,JSON.stringify(controlSnapshot(r.bot)));const restored=rig();await restoreControls(restored.bot,path);assert.equal(restored.state.autoImageEnabled,false);assert.equal(restored.state.autoImageProbability,.7);assert.equal(restored.state.enabled,false);
  const old=controlSnapshot(r.bot);delete old.groups[0].autoImageEnabled;delete old.groups[0].autoImageProbability;await writeFile(path,JSON.stringify(old));const compatible=rig();await restoreControls(compatible.bot,path);assert.equal(compatible.state.autoImageEnabled,true);assert.equal(compatible.state.autoImageProbability,.2);assert.equal(compatible.state.enabled,false);
 }finally{assert.equal(dirname(root),tmpdir());assert.ok(basename(root).startsWith('maodie-image-settings-'));await rm(root,{recursive:true,force:true});}
});

test('视觉请求使用单独模型，图片只进本轮用户消息，仍只请求一次',async()=>{
 const c=structuredClone(example);let body,count=0;const llm=new LlmClient(c.llm,'猫猫人设',async(_url,init)=>{count++;body=JSON.parse(init.body);return Response.json({choices:[{message:{content:'猫猫伸个懒腰。'}}]});});
 await llm.generate('接一句',[],0,undefined,120,{imageData:'data:image/jpeg;base64,YWJj'});assert.equal(count,1);assert.equal(body.model,'deepseek-v4.1-flash');assert.equal(body.messages.at(-1).content[1].type,'image_url');assert.equal(body.max_tokens,320);assert.doesNotMatch(body.messages[0].content,/YWJj/);
 assert.deepEqual(visionRate(new Date('2026-10-27T13:00:00Z')),{input:.8,output:3.2});assert.deepEqual(visionRate(new Date('2026-10-27T02:00:00Z')),{input:1.6,output:6.4});
});
