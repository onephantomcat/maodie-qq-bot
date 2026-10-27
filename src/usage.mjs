import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const dayKey = date => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
const timeLabel = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const empty = () => ({ calls: 0, failed: 0, input: 0, output: 0, missingUsage: 0, unpriced: 0, microYuan: 0 });
const tokenCount = n => Number.isSafeInteger(n) && n >= 0 ? n : null;

export function visionRate(date){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=key=>parts.find(x=>x.type===key)?.value;
  const minute=Number(get('hour'))*60+Number(get('minute'));
  const peak=!['Sat','Sun'].includes(get('weekday'))&&((minute>=540&&minute<720)||(minute>=840&&minute<1080));
  return peak?{input:1.6,output:6.4}:{input:0.8,output:3.2};
}

export class UsageMeter {
  constructor(path, { now = () => new Date(), historicalBill = null } = {}) {
    this.path = path; this.now = now; this.historicalBill = historicalBill; this.writes = Promise.resolve();
    this.data = { startedAt: this.now().toISOString(), days: {} };
  }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'));
      if (!saved.days || !Number.isFinite(Date.parse(saved.startedAt))) throw new Error();
      for (const groups of Object.values(saved.days)) for (const bucket of Object.values(groups)) {
        if (Object.keys(empty()).some(key => !Number.isSafeInteger(bucket[key]) || bucket[key] < 0)) throw new Error();
      }
      this.data = saved;
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('本机用量统计无法读取，请检查 usage.local.json；原文件未覆盖'); }
    await this.save(); return this;
  }
  save() {
    const value = JSON.stringify(this.data, null, 2);
    this.writes = this.writes.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, value, 'utf8');
      await rename(`${this.path}.tmp`, this.path);
    });
    return this.writes;
  }
  async record({ model, usage, ok, groupId, scope = 'chat' }) {
    const at=this.now();const day = dayKey(at);
    const key = scope === 'chat' && /^\d+$/.test(String(groupId)) ? `群${groupId}` : scope === 'learning' ? '学习整理' : '本机预览';
    const groups = this.data.days[day] ||= {};
    const row = groups[key] ||= empty();
    row.calls++; if (!ok) row.failed++;
    const input = tokenCount(usage?.prompt_tokens), output = tokenCount(usage?.completion_tokens);
    if (input === null || output === null) row.missingUsage++;
    else {
      row.input += input; row.output += output;
      // 仅采用2026-10-26已核对账单的Flash观察单价，明确作为估算，不冒充实时账单。
      if (model === 'deepseek-v4-flash') row.microYuan += input + 2 * output;
      else if(model==='deepseek-v4.1-flash'){const rate=visionRate(at);row.microYuan+=Math.round(input*rate.input+output*rate.output);}
      else row.unpriced++;
    }
    await this.save();
  }
  report(todayOnly = false) {
    const today = dayKey(this.now());
    const selected = Object.entries(this.data.days).filter(([date]) => !todayOnly || date === today);
    const totals = empty(), byGroup = {};
    for (const [, groups] of selected) for (const [name, row] of Object.entries(groups)) {
      const aggregate = byGroup[name] ||= empty();
      for (const key of Object.keys(totals)) { totals[key] += row[key]; aggregate[key] += row[key]; }
    }
    const line = row => `${row.calls}次请求 · 输入${row.input} / 输出${row.output} token · 估算¥${(row.microYuan / 1e6).toFixed(6)}`;
    const lines = [ `【耄耋 · ${todayOnly ? '今日' : '累计'}用量】`, `本机统计起于：${timeLabel(this.data.startedAt)}`, ...(todayOnly ? [`统计日期：${today}（北京时间）`] : []), line(totals),
      ...Object.entries(byGroup).map(([name, row]) => `${name}：${line(row)}`),
      `失败/取消/结果未知：${totals.failed}次；缺usage：${totals.missingUsage}次；无适用单价：${totals.unpriced}次。`,
      '估算：文本Flash输入¥1/百万、输出¥2/百万；视觉4.1 Flash按10月27日目录价与北京时间峰谷估算，未扣缓存折扣。未知用量和单价不计金额，实际扣费以官网为准。' ];
    const historicalBill = this.historicalBill?.total;
    if (historicalBill && (!todayOnly || String(historicalBill.last).startsWith(today))) {
      lines.push(`历史已核对账单：${historicalBill.calls}次，¥${historicalBill.cost_yuan}，截至${historicalBill.last}。`, '历史账单与本机新增统计分别显示，中间未记录的区间不能据此合计为完整累计费用。');
    }
    lines.push('只统计此监听程序的聊天和学习调用，不含其他程序、独立预览或崩溃前未写入的请求。仅主人私聊可查，查询不调用API。');
    return lines.join('\n');
  }
}
