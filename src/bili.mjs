const headers = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' };
const clip = (text, n) => [...String(text || '')].slice(0, n).join('');
export const plainText = text => String(text || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot);/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function sourceUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('请提供完整的B站视频或图文链接'); }
  if (url.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com'].includes(url.hostname) || url.port || url.username || url.password) throw new Error('仅接受 https://www.bilibili.com 的视频或图文链接');
  const match = /^\/(video\/(BV[a-zA-Z0-9]{10})|opus\/(\d{10,22})|read\/cv(\d{5,12}))\/?$/.exec(url.pathname);
  if (!match) throw new Error('支持 /video/BV…、/opus/数字、/read/cv数字 链接');
  return `https://www.bilibili.com/${match[1]}/`;
}

// 从页面读取JSON数据，不运行网页脚本。
export function initialState(html) {
  const marker = /__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!marker) throw new Error('该图文未提供可读取的正文');
  const text = html.slice(marker.index + marker[0].length);
  let depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return JSON.parse(text.slice(0, i + 1));
  }
  throw new Error('图文数据不完整');
}

export function opusText(state) {
  const modules = state.detail?.modules || [];
  const title = modules.find(x => x.module_title)?.module_title?.text || state.readInfo?.title || '';
  const paragraphs = modules.flatMap(x => x.module_content?.paragraphs || []);
  const words = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.word?.words) words.push(value.word.words);
    if (value.rich?.text) words.push(value.rich.text);
    for (const [key, child] of Object.entries(value)) if (key !== 'word' && key !== 'rich' && child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(walk); else walk(child);
    }
  };
  paragraphs.forEach(walk);
  return { title: plainText(title), text: plainText(words.join(' ') || state.readInfo?.content || '') };
}

export class BiliReader {
  constructor(fetchImpl = fetch) { this.fetch = fetchImpl; }
  async request(url, signal) {
    const response = await this.fetch(url, { headers, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`B站读取受限（HTTP ${response.status}）`);
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) throw new Error('B站资料过大，本次跳过'); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks).toString('utf8');
  }
  async api(url, signal) {
    const text = await this.request(url, signal); let result;
    try { result = JSON.parse(text); } catch { throw new Error('B站返回验证页，本次跳过'); }
    if (result.code !== 0 || !result.data) throw new Error('B站暂未开放此资料，本次跳过');
    return result.data;
  }
  async discover(signal) {
    const data = await this.api(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent('耄耋 梗')}&page=1`, signal);
    return (data.result || []).filter(x => /^BV[a-zA-Z0-9]{10}$/.test(x.bvid || '') && /耄耋|猫爹|哈气/.test(plainText(x.title))).slice(0, 4).map(x => `https://www.bilibili.com/video/${x.bvid}/`);
  }
  async read(input, signal) {
    const url = sourceUrl(input);
    if (!url.includes('/video/')) {
      const parsed = opusText(initialState(await this.request(url, signal)));
      if (!parsed.text) throw new Error('该来源仅有图片或没有可读取正文');
      return { url, title: clip(parsed.title, 80), text: clip(parsed.text, 1800), kind: '图文正文' };
    }
    const bvid = /\/video\/(BV[a-zA-Z0-9]{10})/.exec(url)[1];
    const data = await this.api(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, signal);
    if (!/耄耋|猫爹|哈气|哈基米|曼波/.test(`${data.title} ${data.desc}`)) throw new Error('该视频与耄耋话题不相关');
    let subtitles = data.subtitle?.list || [];
    if (!subtitles.length && data.cid) {
      try {
        const player = await this.api(`https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${Number(data.cid)}`, signal);
        subtitles = player.subtitle?.subtitles || [];
      } catch { if (signal?.aborted) throw new Error('学习已停止'); }
    }
    const chosen = subtitles.find(x => /^zh/.test(x.lan || '')) || subtitles[0];
    if (chosen?.subtitle_url) {
      try {
        const subtitleUrl = new URL(chosen.subtitle_url, 'https://www.bilibili.com/');
        if (subtitleUrl.protocol !== 'https:' || !subtitleUrl.hostname.endsWith('.hdslb.com') || subtitleUrl.username || subtitleUrl.password || subtitleUrl.port) throw new Error('字幕地址不在公开素材域');
        const body = JSON.parse(await this.request(subtitleUrl.href, signal));
        const text = plainText((body.body || []).map(x => x.content || '').join(' '));
        if (text) return { url, title: clip(plainText(data.title), 80), text: clip(text, 1800), kind: '公开字幕' };
      } catch { if (signal?.aborted) throw new Error('学习已停止'); }
    }
    const description = plainText(data.desc).replace(/素材来源于网络[，,]?侵权联系删除|本视频的内容只用于梗科普[^。]*|未经作者授权[^。]*|商务合作[^。]*/g, '').trim();
    if (description.length < 20) throw new Error('没有公开字幕，简介内容不足以整理笔记');
    return { url, title: clip(plainText(data.title), 80), text: clip(description, 1200), kind: '标题简介' };
  }
}
