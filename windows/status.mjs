import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import WebSocket from 'ws';
const config=JSON.parse(await readFile(new URL('../config.local.json',import.meta.url),'utf8'));
const ws=new WebSocket(config.onebot.url,{headers:{Authorization:`Bearer ${config.onebot.token}`},handshakeTimeout:5000});
const timer=setTimeout(()=>{console.error('QQ连接检查超时');ws.terminate();process.exitCode=1;},8000);
const pending=new Map();
const call=(action)=>new Promise((resolve,reject)=>{const echo=action;pending.set(echo,{resolve,reject});ws.send(JSON.stringify({action,params:{},echo}));});
ws.on('message',raw=>{let b;try{b=JSON.parse(raw)}catch{return};const p=pending.get(b.echo);if(p){pending.delete(b.echo);b.retcode===0?p.resolve(b.data):p.reject(new Error('QQ状态查询失败'));}});
ws.on('error',()=>{console.error('无法连接本机QQ服务');clearTimeout(timer);process.exitCode=1;});
ws.on('open',async()=>{try{
 const login=await call('get_login_info');if(String(login.user_id)!==config.selfId)throw new Error('登录账号不匹配');
 const status=await call('get_status');console.log(`QQ账号匹配；${status.online?'在线':'离线'}`);
 const controls=JSON.parse(await readFile(join(process.env.LOCALAPPDATA,'QQFanGu','control-state.json'),'utf8'));
 for(const state of controls.groups)console.log(`群 ${state.groupId}：${state.enabled?'开启':'暂停'} / 火力${state.spice} / ${state.wildMode?'乱咬开启':'普通互动'}`);
 if(!status.online)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}finally{clearTimeout(timer);ws.close();}});
