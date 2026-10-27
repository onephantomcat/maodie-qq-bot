const clip=(text,n)=>[...text].slice(-n).join('');
export class BurstCollector {
  constructor({windowMs=850,maxChars=500,run}){this.windowMs=windowMs;this.maxChars=maxChars;this.run=run;this.pending=new Map();}
  key(state,senderId){return state.groupId+':'+senderId;}
  has(state,senderId){return this.pending.has(this.key(state,senderId));}
  hasGroup(state){return [...this.pending.values()].some(x=>x.state===state);}
  count(state){return [...this.pending.values()].filter(x=>x.state===state).length;}
  add(state,job){
    const key=this.key(state,job.senderId);let entry=this.pending.get(key);
    if(entry&&entry.job.replyId!==job.replyId&&job.replyId){this.flush(key);entry=null;}
    return new Promise(resolve=>{
      if(!entry){entry={state,job:{...job,messageIds:[String(job.event.message_id)],events:[job.event]},parts:[job.text],resolvers:[resolve]};this.pending.set(key,entry);entry.timer=setTimeout(()=>this.flush(key),this.windowMs);}
      else{entry.parts.push(job.text);entry.parts=entry.parts.slice(-3);entry.job.text=clip(entry.parts.filter(Boolean).join('\n'),this.maxChars);entry.job.messageIds.push(String(job.event.message_id));entry.job.events.push(job.event);entry.job.events=entry.job.events.slice(-3);entry.job.directMention||=job.directMention;entry.resolvers.push(resolve);}
    });
  }
  flush(key){const entry=this.pending.get(key);if(!entry)return;clearTimeout(entry.timer);this.pending.delete(key);Promise.resolve().then(()=>this.run(entry.state,entry.job)).catch(()=>{}).finally(()=>entry.resolvers.forEach(resolve=>resolve()));}
  cancel(state){for(const [key,entry] of this.pending){if(entry.state!==state)continue;clearTimeout(entry.timer);this.pending.delete(key);entry.resolvers.forEach(resolve=>resolve());}}
}
