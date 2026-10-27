import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
const clip=(s,n)=>[...String(s)].slice(0,n).join('');
const id=s=>typeof s==='string'&&/^[1-9]\d{4,15}$/.test(s);

export class SocialFeatures {
  constructor(config,path,{now=Date.now}={}) {
    this.config=config;this.path=path;this.now=now;this.writes=Promise.resolve();
    this.data={selfId:config.selfId,ownerId:config.ownerId,groups:{}};
    this.rooms=new Map();this.recent=new Map();
    this.mergeWindowMs=config.features?.mergeWindowMs??850;
  }
  async load(){
    try{
      const saved=JSON.parse(await readFile(this.path,'utf8'));
      if(saved.selfId!==this.config.selfId||saved.ownerId!==this.config.ownerId||!saved.groups||typeof saved.groups!=='object')throw new Error();
      for(const [groupId,row] of Object.entries(saved.groups)){
        if(!this.config.groups.some(g=>g.groupId===groupId))continue;
        if(!Array.isArray(row.optOut)||row.optOut.length>2000||row.optOut.some(x=>!id(x))||!Array.isArray(row.likes)||!Array.isArray(row.avoids)||[...row.likes,...row.avoids].some(x=>typeof x!=='string'||x.length>120))throw new Error();
        this.data.groups[groupId]={optOut:[...new Set(row.optOut)],likes:row.likes.slice(-4),avoids:row.avoids.slice(-4)};
      }
    }catch(error){if(error.code!=='ENOENT')throw new Error('本地互动偏好无法读取，未覆盖原文件');}
    return this;
  }
  row(groupId){if(!this.config.groups.some(g=>g.groupId===groupId))throw new Error('未启用的群');return this.data.groups[groupId]??={optOut:[],likes:[],avoids:[]};}
  save(){const text=JSON.stringify(this.data,null,2);this.writes=this.writes.catch(()=>{}).then(async()=>{await mkdir(dirname(this.path),{recursive:true});await writeFile(this.path+'.tmp',text,'utf8');await rename(this.path+'.tmp',this.path);});return this.writes;}
  isOptedOut(groupId,userId){return this.row(groupId).optOut.includes(userId);}
  async optOut(groupId,userId,enabled){
    if(!id(userId))throw new Error('账号格式不正确');const row=this.row(groupId);
    if(enabled&&!row.optOut.includes(userId)){if(row.optOut.length>=2000)throw new Error('本群免打扰记录已满');row.optOut.push(userId);}
    if(!enabled)row.optOut=row.optOut.filter(x=>x!==userId);
    const room=this.rooms.get(groupId);if(room)room.lines=room.lines.filter(x=>x.userId!==userId);
    await this.save();
  }
  async feedback(groupId,text,positive){
    const row=this.row(groupId),value=clip(text.replace(/\s+/g,' ').trim(),positive?60:28);
    if(!value)throw new Error('这条消息没有可参考的文字');
    const list=positive?row.likes:row.avoids;
    const old=list.indexOf(value);if(old>=0)list.splice(old,1);list.push(value);if(list.length>4)list.shift();
    const other=positive?row.avoids:row.likes;for(let i=other.length-1;i>=0;i--)if(other[i].startsWith(value)||value.startsWith(other[i]))other.splice(i,1);
    await this.save();
  }
  observe(groupId,{messageId,userId,text,protectedReference=false}){
    if(!text||protectedReference||this.isOptedOut(groupId,userId))return;
    let room=this.rooms.get(groupId);if(!room){room={lines:[],labels:new Map()};this.rooms.set(groupId,room);}
    if(!room.labels.has(userId)){if(room.labels.size>=64)room.labels.clear();room.labels.set(userId,'群友'+(room.labels.size+1));}
    room.lines=room.lines.filter(x=>this.now()-x.time<=120000&&x.messageId!==String(messageId));
    room.lines.push({messageId:String(messageId),userId,label:room.labels.get(userId),text:clip(text,90),time:this.now()});
    room.lines=room.lines.slice(-8);
  }
  context(groupId,messageIds=[]){
    const room=this.rooms.get(groupId);if(!room)return '';
    const excluded=new Set(messageIds.map(String));
    return clip(room.lines.filter(x=>this.now()-x.time<=120000&&!excluded.has(x.messageId)&&!this.isOptedOut(groupId,x.userId)).slice(-5).map(x=>`${x.label}：${x.text}`).join('\n'),300);
  }
  recordReply(groupId,text){const list=this.recent.get(groupId)||[];list.push(clip(text,80));this.recent.set(groupId,list.slice(-4));}
  toneContext(groupId){
    const row=this.row(groupId);const lines=[];
    const moods=['困困的但认真','有点小得意','假装委屈但不埋怨人','精神一点、轻快一点'];
    lines.push('猫情绪：'+moods[(Math.floor(this.now()/900000)+Number(groupId)%4)%4]+'；只调措辞，不改变火力、礼貌或认真答题。');
    if(row.likes.length)lines.push('主人喜欢的接话节奏（只学节奏，不复用原句）：'+JSON.stringify(row.likes.slice(-1).map(x=>clip(x,45))));
    if(row.avoids.length)lines.push('主人嫌套的措辞，少用：'+JSON.stringify(row.avoids.slice(-1).map(x=>clip(x,25))));
    const recent=this.recent.get(groupId)||[];
    if(recent.length)lines.push('本群刚说过的句子，换开头、比喻和包袱：'+JSON.stringify(recent.slice(-3).map(x=>clip(x,45))));
    return clip(lines.join('\n'),360);
  }
  clear(groupId){this.rooms.delete(groupId);this.recent.delete(groupId);}
}
