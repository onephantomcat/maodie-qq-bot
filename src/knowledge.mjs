import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const clip = (text, size) => [...text].slice(0, size).join('');
function containsAlias(text, alias) {
  if (/^[a-z0-9]+$/i.test(alias)) {
    const letters = alias.split('').join('[\\s\\p{P}\\p{S}]*');
    return new RegExp(`(?<![a-z0-9])${letters}(?![a-z0-9])`, 'iu').test(String(text).normalize('NFKC'));
  }
  return normalize(text).includes(normalize(alias));
}

export class MemeKnowledge {
  constructor(entries, slang = []) { this.entries = entries; this.slang = slang; }
  static async load(path) {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data.slang == null) {
      try { data.slang = JSON.parse(await readFile(path instanceof URL ? new URL('slang.json',path) : join(dirname(path),'slang.json'),'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('本地谐音词表无法读取'); }
    }
    if (!Array.isArray(data.entries) || data.entries.some(x => !x.name || !Array.isArray(x.aliases) || !x.meaning || !x.hint || !Array.isArray(x.sources))) throw new Error('本地热梗库格式不正确');
    if (data.slang != null && (!Array.isArray(data.slang) || data.slang.some(x => !x.canonical || !x.meme || !x.hint || !Array.isArray(x.aliases) || x.aliases.some(a => typeof a !== 'string' || normalize(a).length < 2) || !Array.isArray(x.literalTerms) || x.literalTerms.some(a => typeof a !== 'string' || !normalize(a))))) throw new Error('本地谐音词表格式不正确');
    return new MemeKnowledge(data.entries, data.slang);
  }
  interpret(query) {
    return this.slang.flatMap(rule => {
      const alias = rule.aliases.find(a => containsAlias(query, a));
      if (!alias || rule.literalTerms.some(term => containsAlias(query, term))) return [];
      return [{ alias, ...rule }];
    }).slice(0, 3);
  }
  search(query, limit = 3) {
    const expanded = `${query} ${this.interpret(query).map(x => `${x.canonical} ${x.meme}`).join(' ')}`;
    const text = normalize(expanded);
    if (!text) return [];
    return this.entries.map(entry => ({ entry, score: Math.max(0, ...[entry.name, ...entry.aliases].filter(Boolean).map(alias => containsAlias(expanded, alias) ? normalize(alias).length : normalize(alias).includes(text) ? 1 : 0)) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.entry);
  }
  context(text) {
    const slang = this.interpret(text);
    const associations = slang.map(x => `语境联想：本句“${x.alias}”可能指“${x.canonical}”。${x.hint}`);
    // 聊天仅匹配完整关键词；不因“哈”“包”等单字自动接梗。
    const matches = this.search(text, this.entries.length).filter(x => slang.some(s => s.meme === x.name) || [x.name, ...x.aliases].some(a => normalize(a).length >= 2 && containsAlias(text, a)));
    return clip([...associations, ...matches.map(x => `${x.name}：${x.meaning} 接法：${x.hint}`)].slice(0, 3).join('\n'), 400);
  }
  list() { return `【耄耋 · 本地热梗】\n${this.entries.map(x => `· ${x.name}`).join('\n')}\n\n/查梗 关键词 — 查看解释与参考页\n聊天仍需 @ 或引用我；主人开启乱咬后也可能随机接梗。`; }
  lookup(query) {
    if (!normalize(query)) return '用法：/查梗 红温\n也可以先发 /热梗列表。';
    const matches = this.search(query);
    if (!matches.length) return '本地梗库里暂时没找到，可以用 /热梗列表 查看已有词条。';
    const association = this.interpret(query).map(x => `谐音联想：${x.alias} → ${x.canonical}（按聊天语境判断）`).join('\n');
    return [association, ...matches.map(x => `【${x.name}】\n${x.meaning}\n参考：${x.sources[0]}`)].filter(Boolean).join('\n\n');
  }
}
