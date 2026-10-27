import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
const allowedHosts=new Set(['gchat.qpic.cn','c2cpicdw.qpic.cn','multimedia.nt.qq.com.cn','gxh.vip.qq.com']);
export function imageSegments(event){
 if(Array.isArray(event?.message))return event.message.filter(x=>x?.type==='image').map(x=>({url:String(x.data?.url||''),file:String(x.data?.file||'')})).slice(0,1);
 const result=[];for(const match of String(event?.message||event?.raw_message||'').matchAll(/\[CQ:image,([^\]]+)\]/gi)){
  const data=Object.fromEntries(match[1].split(',').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/&#44;/g,',').replace(/&amp;/g,'&')];}));
  result.push({url:data.url||'',file:data.file||''});if(result.length===1)break;
 }return result;
}
export const imageIntent=text=>/^\/识图(?:\s|$)/u.test(text)||/(?:看看?(?:这张|图)|识(?:别)?图|读图|图里(?:的)?(?:字|文字)|截图(?:里|上)(?:写|的字))/u.test(text);
export async function fetchQQImage(image,{fetchImpl=fetch,signal}={}){
 let url;try{url=new URL(image.url);}catch{throw new Error('没有可读取的QQ图片地址，请重新发图');}
 if(url.hostname==='gxh.vip.qq.com'&&!/^\/club\/item\/parcel\/item\/[a-zA-Z0-9]{2}\/[a-zA-Z0-9]{8,128}\/raw300\.gif$/.test(url.pathname))throw new Error('商城表情地址不可用');
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!allowedHosts.has(url.hostname))throw new Error('只读取QQ图片，请重新发送图片');
 const response=await fetchImpl(url.href,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
 if(!response.ok||!(response.headers.get('content-type')||'').startsWith('image/'))throw new Error('QQ图片暂时无法读取，请重新发图');
 if(Number(response.headers.get('content-length'))>5*1024*1024)throw new Error('图片超过5MB，请裁成几张清晰截图');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>5*1024*1024)throw new Error('图片超过5MB，请裁成几张清晰截图');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export class LocalOcr {
 constructor({python='python',fetchImpl=fetch,workerPath=fileURLToPath(new URL('../tools/ocr_worker.py',import.meta.url)),timeoutMs=45000,resolveImage=async()=>null}={}){this.resolveImage=resolveImage;this.python=python;this.fetch=fetchImpl;this.workerPath=workerPath;this.timeoutMs=timeoutMs;this.pending=new Map();this.serial=0;}
 ensure(){if(this.child)return;const child=spawn(this.python,['-u',this.workerPath],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});this.child=child;
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{let row;try{row=JSON.parse(line);}catch{return;}const pending=this.pending.get(row.id);if(!pending)return;row.error?pending.finish(new Error(row.error)):pending.finish(null,pending.withImage?{text:String(row.text||'').slice(0,600),imageData:typeof row.imageData==='string'?row.imageData:''}:String(row.text||'').slice(0,600));});
  const failed=()=>{if(this.child!==child)return;this.child=null;for(const p of [...this.pending.values()])p.finish(new Error('本机OCR未就绪，请检查Python和识字依赖'));};child.on('error',failed);child.on('exit',failed);
 }
 async recognize(image,{signal}={}){return this.recognizeBytes(await this.loadImage(image,{signal}),{signal});}
 async inspect(image,{signal}={}){return this.recognizeBytes(await this.loadImage(image,{signal}),{signal,withImage:true});}
 async loadImage(image,{signal}={}){
  let source=image;
  const refresh=async()=>{if(!/^[a-zA-Z0-9_.-]{1,180}$/.test(image.file||''))return null;const info=await this.resolveImage(image.file);return info?.url?{url:info.url}:null;};
  if(!source.url)source=await refresh()||source;
  let bytes;try{bytes=await fetchQQImage(source,{fetchImpl:this.fetch,signal});}catch(error){if(signal?.aborted)throw error;const fresh=await refresh();if(!fresh)throw error;bytes=await fetchQQImage(fresh,{fetchImpl:this.fetch,signal});}
  return bytes;
 }
 recognizeBytes(bytes,{signal,withImage=false}={}){
  if(signal?.aborted)return Promise.reject(new Error('识图已取消'));if(bytes.length>5*1024*1024)return Promise.reject(new Error('图片超过5MB'));if(this.pending.size>=3)return Promise.reject(new Error('正在识别其他图片，稍后再试'));
  this.ensure();const id=++this.serial;
  return new Promise((resolve,reject)=>{
   let timer;const onAbort=()=>finish(new Error('识图已取消'));
   const finish=(error,text)=>{if(!this.pending.has(id))return;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);this.pending.delete(id);error?reject(error):resolve(text);};
   this.pending.set(id,{finish,withImage});timer=setTimeout(()=>{finish(new Error('识图超时，请换更小的清晰截图'));if(!this.pending.size)this.close();},this.timeoutMs);
   signal?.addEventListener('abort',onAbort,{once:true});
   this.child.stdin.write(JSON.stringify({id,image:bytes.toString('base64'),withImage})+'\n',error=>{if(error)finish(new Error('OCR进程暂不可用'));});
  });
 }
 close(){const child=this.child;this.child=null;child?.kill();for(const p of [...this.pending.values()])p.finish(new Error('识图已停止'));}
}
