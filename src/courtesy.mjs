const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
const compact = value => normalize(value).replace(/\s+/gu, '');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesOf = member => [...new Set([member?.card, member?.nickname].filter(x => typeof x === 'string' && x.trim()).map(x => x.slice(0, 80)))];

export function mentionedUserIds(event) {
  if (Array.isArray(event?.message)) return event.message.filter(x => x?.type === 'at').map(x => String(x.data?.qq || '')).filter(x => /^\d+$/.test(x));
  return [...String(event?.message || event?.raw_message || '').matchAll(/\[CQ:at,qq=(\d+)(?:,|\])/gi)].map(x => x[1]);
}

export class Courtesy {
  constructor(entries = [], { lookupMember = async () => null, now = Date.now } = {}) {
    this.entries = entries; this.ids = new Set(entries.map(x => x.userId));
    this.lookupMember = lookupMember; this.now = now; this.members = new Map();
  }
  names(groupId) {
    const names = new Set(this.entries.flatMap(x => Object.values(x.groupAliases || {}).flat()));
    for (const id of this.ids) for (const name of this.members.get(`${groupId}:${id}`)?.names || []) names.add(name);
    return [...names].filter(x => typeof x === 'string' && x.trim());
  }
  observe(event) {
    const id = String(event.user_id);
    if (!this.ids.has(id)) return;
    const key = `${event.group_id}:${id}`, previous = this.members.get(key);
    const names = namesOf(event.sender);
    if (names.length) this.members.set(key, { names: [...new Set([...(previous?.names || []), ...names])].slice(-16), checkedAt: this.now() });
  }
  async refresh(groupId) {
    await Promise.all(this.entries.map(async entry => {
      const key = `${groupId}:${entry.userId}`, previous = this.members.get(key);
      if (previous && this.now() - previous.checkedAt < 300000) return;
      this.members.set(key, { names: previous?.names || [], checkedAt: this.now() });
      try {
        const member = await this.lookupMember(groupId, entry.userId);
        if (String(member?.user_id) !== entry.userId) return;
        this.members.set(key, { names: [...new Set([...(previous?.names || []), ...namesOf(member)])].slice(-16), checkedAt: this.now() });
      } catch { /* 不在群里或连接暂时失败时沿用本机已核对的名字，不公开提示。 */ }
    }));
  }
  mentionsText(text, groupId) {
    if (!this.ids.size) return false;
    const value = normalize(text), joined = compact(text);
    if ([...this.ids].some(id => new RegExp(`(?<![0-9])${id}(?![0-9])`).test(value))) return true;
    return this.names(groupId).some(name => {
      const alias = compact(name);
      if (/^[a-z0-9_]+$/u.test(alias)) return new RegExp(`(?<![a-z0-9_])${[...alias].map(escape).join('\\s*')}(?![a-z0-9_])`, 'u').test(value);
      if ([...alias].length === 1) return new RegExp(`(?:^|[\\s\\p{P}\\p{S}])${escape(alias)}(?:$|[\\s\\p{P}\\p{S}])`, 'u').test(value);
      return joined.includes(alias);
    });
  }
  involves(event, text, quote = null) {
    const groupId = String(event.group_id);
    return this.ids.has(String(event.user_id)) || mentionedUserIds(event).some(id => this.ids.has(id)) ||
      this.ids.has(quote?.authorId) || (quote?.mentionedIds || []).some(id => this.ids.has(id)) ||
      this.mentionsText(`${text}\n${quote?.text || ''}`, groupId);
  }
}
