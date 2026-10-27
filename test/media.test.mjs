import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {LocalMedia} from '../src/media.mjs';

async function removeTemp(root) {
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));
  assert.ok(basename(root).startsWith('maodie-'));
  await rm(root,{recursive:true,force:true});
}

test('读取原音效库的启用和移除状态，保留完整字节和完整歌曲，不修改原库',async()=>{
  const root=await mkdtemp(join(tmpdir(),'maodie-audio-'));
  try {
    const saved={custom:[
      {id:'u_song',label:'完整歌曲',enabled:true,weight:1,delivery:'voice',seconds:139.86},
      {id:'u_off',enabled:false,weight:1},{id:'u_removed',enabled:true,weight:1,removed:true},
      {id:'u_zero',enabled:true,weight:0},{id:'../config.local',enabled:true,weight:1}
    ]};
    const source=JSON.stringify(saved);
    await writeFile(join(root,'library.json'),source);
    const bytes=Buffer.from('ID3-original-complete-audio');
    await writeFile(join(root,'u_song.mp3'),bytes);
    const media=new LocalMedia(root,{audioDirectory:root},{random:()=>0});
    const list=await media.audioList(); assert.equal(list.length,1); assert.equal(list[0].seconds,139.86);
    const result=await media.audio(1);
    assert.equal(result.segment.type,'record');
    assert.deepEqual(Buffer.from(result.segment.data.file.slice(9),'base64'),bytes);
    assert.equal(await readFile(join(root,'library.json'),'utf8'),source);
    await assert.rejects(()=>media.audio(99),/没有这个音效编号/);
  } finally {await removeTemp(root);}
});

test('只发本地清单中启用的图片，拒绝路径穿越，保留GIF原始字节',async()=>{
  const root=await mkdtemp(join(tmpdir(),'maodie-image-'));
  try {
    await mkdir(join(root,'stickers'));
    await writeFile(join(root,'stickers','manifest.json'),JSON.stringify([
      {id:'M01',file:'M01.gif',enabled:true,label:'动态'},
      {id:'M02',file:'M02.png',enabled:false},{id:'M03',file:'../config.local.json',enabled:true}
    ]));
    const bytes=Buffer.from('GIF89a-unchanged-frames'); await writeFile(join(root,'stickers','M01.gif'),bytes);
    const media=new LocalMedia(root,{stickerDirectory:'stickers'},{random:()=>0});
    assert.equal((await media.stickerList()).length,1);
    const sticker=await media.sticker('M01');
    assert.equal(sticker.segment.data.sub_type,1);
    assert.equal(sticker.segment.data.summary,'[动画表情]');
    assert.deepEqual(Buffer.from(sticker.segment.data.file.slice(9),'base64'),bytes);
    await assert.rejects(()=>media.sticker('M99'),/没有这个表情编号/);
  } finally {await removeTemp(root);}
});

test('音效与表情分别避开近期重复，声音超过QQ语音上限时不提交',async()=>{
  const root=await mkdtemp(join(tmpdir(),'maodie-limits-'));
  try {
    const media=new LocalMedia(root,{audioDirectory:root},{random:()=>0});
    const list=[{id:'a'},{id:'b'},{id:'c'}];
    assert.deepEqual(Array.from({length:4},()=>media.choose(list,media.recentAudio).id),['a','b','c','a']);
    assert.equal(media.choose(list,media.recentStickers).id,'a');
    await writeFile(join(root,'library.json'),JSON.stringify({custom:[{id:'big',enabled:true,weight:1,delivery:'voice'}]}));
    await writeFile(join(root,'big.mp3'),Buffer.alloc(5*1024*1024+1));
    await assert.rejects(()=>media.audio(1),/发送大小上限/);
  } finally {await removeTemp(root);}
});

test('同一随机池可选静态和GIF，原字节和QQ表情子类型保留，GIF格式检查仍有效', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maodie-gif-'));
  try {
    const items = [
      { id: 'M01', file: 'M01.png', enabled: true, frames: 1, label: '静态' },
      { id: 'M03', file: 'M03.gif', enabled: true, frames: 26, label: '歪头' }
    ];
    await writeFile(join(root, 'manifest.json'), JSON.stringify(items));
    const bytes = Buffer.from('GIF89a-original-animation-bytes');
    await writeFile(join(root, 'M01.png'), 'static-original-bytes');
    await writeFile(join(root, 'M03.gif'), bytes);
    const media = new LocalMedia(root, { stickerDirectory: root }, { random: () => 0 });
    assert.equal((await media.sticker()).label, '静态');
    const result = await media.sticker();
    assert.equal(result.label, '歪头'); assert.equal(result.segment.data.sub_type, 1);
    assert.deepEqual(Buffer.from(result.segment.data.file.slice(9), 'base64'), bytes);
    assert.equal((await media.sticker('M01')).label, '静态');
    await writeFile(join(root, 'M03.gif'), 'not-a-gif');
    await assert.rejects(() => media.sticker('M03'), /不是有效的GIF/);
  } finally { await removeTemp(root); }
});
