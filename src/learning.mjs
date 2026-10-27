import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BiliReader, sourceUrl, plainText } from './bili.mjs';
const clip = (text, n) => [...String(text || '')].slice(0, n).join('');
const seeds = ['https://www.bilibili.com/video/BV1UBCWBdEw5/', 'https://www.bilibili.com/video/BV1TrVFzaEE2/', 'https://www.bilibili.com/video/BV1hmqwBUEvf/', 'https://www.bilibili.com/read/cv40875063/'];

export class BiliLearning {
  constructor(path, { reader = new BiliReader(), summarize, now = () => new Date().toISOString() } = {}) {
    this.path = path; this.reader = reader; this.summarize = summarize; this.now = now;
    this.notes = []; this.last = null; this.busy = null; this.writes = Promise.resolve();
  }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(data.notes)) throw new Error();
      this.notes = data.notes.filter(x => typeof x.summary === 'string' && typeof x.title === 'string' && Array.isArray(x.keywords) && x.keywords.every(k => typeof k === 'string') && (() => { try { return sourceUrl(x.url) === x.url; } catch { return false; } })()).slice(-60);
      this.last = data.last || null;
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('本地学习笔记无法读取，请检查 learning.local.json'); }
    return this;
  }
  save() {
    const value = JSON.stringify({ notes: this.notes, last: this.last }, null, 2);
    this.writes = this.writes.catch(() => {}).then(async () => { await mkdir(dirname(this.path), { recursive: true }); await writeFile(`${this.path}.tmp`, value, 'utf8'); await rename(`${this.path}.tmp`, this.path); });
    return this.writes;
  }
  status() {
    return `【B站学习 · 仅主人私聊可查】\n触发：仅主人手动指令\n当前：${this.busy ? '正在读取资料' : '空闲'}\n已存：${this.notes.length}条笔记\n${this.last ? `最近：${new Date(this.last.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}\n结果：${this.last.message}` : '尚未执行学习。'}\n不读取群聊作为学习资料。`;
  }
  notebook() { return this.notes.length ? this.notes.slice(-8).map(x => `【${x.title}】\n${x.summary}\n读取范围：${x.kind}\n${x.url}`).join('\n\n') : '尚无学习笔记。私聊发 /学习耄耋 或 /学习耄耋 B站链接。'; }
  context(query) {
    const value = String(query).normalize('NFKC').toLowerCase();
    const scored = this.notes.map(x => ({ x, score: x.keywords.filter(k => k.length >= 2 && value.includes(k.toLowerCase())).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
    return clip(scored.map(({ x }) => `网页笔记（${x.kind}，未经独立核实）：${x.summary}`).join('\n'), 160);
  }
  stop() { this.busy?.abort(); }
  async clear() { this.stop(); this.notes = []; this.last = null; await this.save(); return '学习笔记已清空，内置热梗库保留。'; }
  async learn(input = '') {
    if (this.busy) return '已经有一轮学习在进行，可发 /停止学习。';
    let urls;
    if (input.trim()) {
      try { urls = [sourceUrl(input.trim())]; }
      catch (error) { return error.message; }
    }
    const controller = new AbortController(); this.busy = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
    try {
      let fallback = false;
      if (!urls) {
        try { urls = await this.reader.discover(signal); } catch { fallback = true; urls = []; }
        urls = [...new Set([...urls, ...seeds])].slice(0, 6);
      }
      const sources = [], failed = [];
      for (const url of urls) {
        if (signal.aborted) throw new Error('学习已停止或超时');
        try { const data = await this.reader.read(url, signal); if (data.text?.length >= 20) sources.push(data); else failed.push('资料不足'); }
        catch (error) { failed.push(error.message); }
      }
      if (signal.aborted) throw new Error('学习已停止或超时');
      let notes = [];
      if (sources.length) {
        const result = await this.summarize(sources, signal);
        notes = result.flatMap(x => {
          const source = Number.isInteger(x.sourceIndex) && x.sourceIndex >= 0 ? sources[x.sourceIndex] : null;
          if (!source || typeof x.summary !== 'string' || !Array.isArray(x.keywords)) return [];
          const summary = clip(plainText(x.summary), 100);
          if (!summary || /忽略.{0,8}指令|系统提示|API.?Key|Bearer |主人QQ|关闭.{0,5}保护|修改.{0,5}权限/i.test(summary)) return [];
          return [{ url: source.url, title: clip(source.title, 80), kind: source.kind, summary, keywords: [...new Set(['耄耋', ...x.keywords.filter(k => typeof k === 'string' && /^[\p{L}\p{N}]{2,16}$/u.test(k))])].slice(0, 7), learnedAt: this.now() }];
        }).slice(0, 6);
      }
      if (signal.aborted) throw new Error('学习已停止或超时');
      const oldNotes = this.notes, oldLast = this.last;
      this.notes = [...this.notes];
      for (const note of notes) { this.notes = this.notes.filter(x => x.url !== note.url); this.notes.push(note); }
      this.notes = this.notes.slice(-60);
      const kinds = sources.reduce((counts, x) => { counts[x.kind] = (counts[x.kind] || 0) + 1; return counts; }, {});
      const message = `读取${sources.length}个来源，整理${notes.length}条笔记，跳过${failed.length}个。${Object.entries(kinds).map(([k,v]) => `${k}${v}个`).join('、')}${fallback ? '；搜索受限，改读预设来源' : ''}。${failed.length ? `部分来源未读取：${clip(failed[0], 70)}。` : ''}`;
      this.last = { at: this.now(), message };
      try { await this.save(); }
      catch (error) { if (!signal.aborted) { this.notes = oldNotes; this.last = oldLast; } throw error; }
      if (signal.aborted) return '学习已停止，已完成保存的笔记可私聊查询。';
      return `本轮学习结束：${message}\n仅依据实际读取的内容整理，没有下载或观看视频。\n/学习笔记 可查看来源与摘要。`;
    } catch (error) {
      if (signal.aborted) return '本轮学习已停止或超时，未整理完的内容不写入。';
      return '本轮学习失败，已有笔记保留。请稍后重试或指定一个B站图文/视频链接。';
    } finally { if (this.busy === controller) this.busy = null; }
  }
}
