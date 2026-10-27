// 本地语境提示只负责选素材，不执行管理操作，也不调用模型。
export function stickerMood(text) {
  const value = String(text).normalize('NFKC');
  const rules = [
    ['sad', /难过|伤心|委屈|失落|想哭|呜呜|哭了|难受|安慰|抱抱/],
    ['thanks', /谢谢|感谢|辛苦|送花|爱你|喜欢你/],
    ['happy', /好耶|开心|高兴|太好了|成功了|恭喜|搞定|赢了|过了/],
    ['angry', /红温|生气|气死|愤怒|气炸|哈气/],
    ['speechless', /无语|无奈|服了|沉默|尴尬|离谱|绷不住/],
    ['surprised', /震惊|惊了|居然|竟然|卧槽|我去|什么情况/],
    ['laugh', /哈哈|笑死|笑麻|好笑|乐了|笑话/],
    ['confused', /不懂|没懂|不知道|疑惑|为啥|为什么|什么意思|何意味|[?？]/],
    ['challenge', /单挑|有本事|放马|来战|不服|欠挠|闭嘴|傻逼/]
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || null;
}

const audioAliases = [
  ['雨爱', '雨爱', '司凤'], ['千早爱音哇袄', '千早爱音', '爱音', '哇袄'],
  ['唐笑', '唐笑'], ['菜就多练', '菜就多练'], ['Ciallo', 'ciallo', '西奥', '西艾罗'],
  ['Man! What can I say', 'what can i say', 'man'],
  ['哎哟我滴妈', '哎哟我滴妈', '哎哟我滴妈笑声'], ['金属管坠落', '金属管', '钢管', '铁管']
];
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function chatHint(text, history = [], { addressedToSelf = false, quoteContext = '' } = {}) {
  const value = normalize(text);
  if (addressedToSelf && !quoteContext && /^(?:你这|你个|你这只|小)?(?:丑猫|臭猫|贱猫|傻猫|好猫|乖猫|坏猫|笨猫)(?:啊|呀|呢|嘛)?$/u.test(value)) {
    return '对方直接在叫耄耋：优先把这个猫咪称呼理解为在叫你自己，不转去评价第三只猫。温和档软软自我解嘲，不质问对方。';
  }
  const context = `${quoteContext} ${history.map(x => x.content || '').join(' ')}`;
  if (/^[这那]台(?:基本|好像|也|几乎|没|不|都|就|还|怎么|在|是|人|$)/u.test(value) && !/机器|电脑|设备|终端|手机|闸机|打印机|服务器|售货机|刷脸|冰箱|电视/u.test(`${text} ${context}`)) {
    return '“这台/那台”的具体对象尚不明确；不能解释成群里冷清或脑补设备状态。上下文仍无对象时，简短问在说哪台、什么东西。';
  }
  return '';
}

function requestedItem(text, name) {
  // 只接受完整请求句；否定、讨论、转述不作点播。先拆动作，再精确匹配本地素材名。
  let value = normalize(text);
  if (value.length > 100) return null;
  const addressed = normalize(name);
  if (value.startsWith(addressed)) value = value.slice(addressed.length);
  for (let i = 0; i < 6; i++) {
    const next = value.replace(/^(?:请|麻烦你|麻烦|能不能|可不可以|可以|帮我|给我|我想|我要|想要|再|重新|把|你)/u, '');
    if (next === value) break;
    value = next;
  }
  value = value.replace(/(?:可以吗|好吗|行吗|谢谢|吧|呗|呀|啊)$/u, '');
  value = value.replace(/(?:给我)?(?:听听|听一下|听|看看|看一下|看)$/u, '');
  const quantity = '(?:一下|一(?:小)?(?:个|段|首|遍|张)|段|首|个|张|点)?';
  const before = new RegExp(`^(?:播放|点播|换成|替换成|换|放|播|来|发|整|听)${quantity}(?:那个|这个)?(.+)$`, 'u').exec(value);
  if (before) return before[1];
  const after = new RegExp(`^(.+?)(?:(?:再|重新|能不能|可不可以|可以|给我)){0,3}(?:播放|放|播|来|换|整)${quantity}$`, 'u').exec(value);
  return after?.[1] || null;
}

export function stickerIntent(text, name = '耄耋') {
  const request = requestedItem(text, name);
  if (!request) return null;
  if (/^(?:随机)?(?:耄耋|猫猫|猫|本地)?的?(?:gif(?:动图|表情包?)?|动态表情包?|动图(?:表情包)?)$/u.test(request)) return { command: '/随机表情' };
  if (/^(?:随机)?(?:耄耋|猫猫|猫|本地)?的?(?:表情包|表情|图|图片)$/u.test(request)) return { command: '/随机表情' };
  const id = /^(?:表情包?|图片?|动图|gif)?(m\d{1,4})(?:号|表情包?|图片?|动图|gif)?$/u.exec(request)?.[1];
  return id ? { command: `/表情 ${id.toUpperCase()}` } : null;
}

export function audioIntent(text, entries, name = '耄耋') {
  const request = requestedItem(text, name)?.replace(/^(?:随机来|随机放)/, '随机');
  if (!request) return null;
  if (/^(?:随机(?:音效|声音|语音)|(?:个)?随机(?:音效|声音|语音)|音效|声音|语音)$/.test(request)) return { command: '/随机音效' };
  const target = request.replace(/(?:的)?(?:音效|语音|声音)$/, '');
  if (!target) return null;
  const found = entries.map((entry, index) => {
    const aliases = audioAliases.find(([prefix]) => normalize(entry.label).startsWith(normalize(prefix)))?.slice(1) || [];
    const baseLabel = entry.label.replace(/[（(].*$/, '').replace(/·.*$/, '');
    return [baseLabel, ...aliases].some(alias => normalize(alias) === target) ? index + 1 : null;
  }).filter(Boolean);
  if (found.length === 1) return { command: `/音效 ${found[0]}` };
  if (!found.length && !/(?:音效|语音|声音)/u.test(request)) return null;
  return { error: found.length ? '这个名字对应多段音效，请用 /音效列表 选编号。' : '没找到这段音效，可以发 /音效列表 看名称。' };
}
