import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { stickerMood } from './intents.mjs';
export const isAnimatedSticker = item => /\.gif$/i.test(item.file || '') && Number(item.frames) > 1;

// 按本机已查看的素材标注；原编号、文件和手动随机池保留。
const moodIds = {
  sad: ['M51','M09','M03'], thanks: ['M09','M03','M48'],
  happy: ['M22','M26','M48','M52'], angry: ['M15','M19','M27','M30','M37','M43'],
  speechless: ['M13','M33','M42'], surprised: ['M32','M47'],
  laugh: ['M02','M17','M18','M44'], confused: ['M01','M07','M14','M39'],
  challenge: ['M05','M06','M10','M12','M23','M46']
};

export class LocalMedia {
  constructor(root, settings = {}, { random = Math.random, localAppData = process.env.LOCALAPPDATA } = {}) {
    this.audioDirectory = settings.audioDirectory || (localAppData ? join(localAppData, 'QQAtSound', 'custom-sounds') : '');
    this.stickerDirectory = resolve(root, settings.stickerDirectory || 'assets/stickers');
    this.random = random;
    this.recentAudio = [];
    this.recentStickers = [];
  }
  async audioList() {
    let saved;
    try { saved = JSON.parse(await readFile(join(this.audioDirectory, 'library.json'), 'utf8')); }
    catch { throw new Error('私人音效库无法读取，请检查本机音效助手的音效目录'); }
    return (saved.custom || []).filter(x => x.enabled && !x.removed && Number(x.weight) > 0 && /^[a-z0-9_]{1,64}$/.test(x.id))
      .map(x => ({ id: x.id, label: x.label || x.id, seconds: x.seconds, weight: Number(x.weight), delivery: x.delivery || 'voice' }));
  }
  async stickerList() {
    let saved;
    try { saved = JSON.parse(await readFile(join(this.stickerDirectory, 'manifest.json'), 'utf8')); }
    catch { throw new Error('本地耄耋表情库无法读取'); }
    return saved.filter(x => x.enabled && /^M\d+$/.test(x.id) && /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)$/i.test(x.file));
  }
  choose(list, recent) {
    if (!list.length) throw new Error('库里没有可用素材');
    const choices = list.length > 1 ? list.filter(x => !recent.includes(x.id)) : list;
    const pool = choices.length ? choices : list.filter(x => x.id !== recent.at(-1));
    const usable = pool.length ? pool : list;
    let cursor = this.random() * usable.reduce((sum, x) => sum + (x.weight || 1), 0);
    let picked = usable.at(-1);
    for (const item of usable) { cursor -= item.weight || 1; if (cursor < 0) { picked = item; break; } }
    recent.push(picked.id);
    if (recent.length > 2) recent.shift();
    return picked;
  }
  async audio(number = null) {
    const list = await this.audioList();
    const entry = number == null ? this.choose(list, this.recentAudio) : list[number - 1];
    if (!entry) throw new Error('没有这个音效编号，请先发 /音效列表');
    let data;
    try { data = await readFile(join(this.audioDirectory, `${entry.id}.mp3`)); }
    catch { throw new Error('音效文件无法读取，请在本机检查音效库'); }
    const fileMode = entry.delivery === 'file';
    if (data.length > (fileMode ? 40 : 5) * 1024 * 1024) throw new Error('音效文件超出发送大小上限');
    return { label: entry.label, segment: { type: fileMode ? 'file' : 'record', data: {
      file: `base64://${data.toString('base64')}`,
      ...(fileMode ? { name: entry.label.replace(/[\\/:*?"<>|]/g, '_') + '.mp3' } : {})
    } } };
  }
  async sticker(id = null, context = '') {
    const list = await this.stickerList();
    const mood = stickerMood(context);
    const matched = mood ? list.filter(x => moodIds[mood]?.includes(x.id) || (Array.isArray(x.moods) && x.moods.includes(mood))) : [];
    const entry = id ? list.find(x => x.id === id.toUpperCase()) : this.choose(matched.length ? matched : list, this.recentStickers);
    if (!entry) throw new Error('没有这个表情编号，请先发 /表情列表');
    let data;
    try { data = await readFile(join(this.stickerDirectory, entry.file)); }
    catch { throw new Error('本地表情文件无法读取'); }
    if (data.length > 8 * 1024 * 1024) throw new Error('表情文件超过 8 MB');
    if (/\.gif$/i.test(entry.file) && !/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) throw new Error('表情文件不是有效的GIF');
    return { label: entry.label, segment: { type: 'image', data: { file: `base64://${data.toString('base64')}`, sub_type: 1, summary: '[动画表情]' } } };
  }
}
