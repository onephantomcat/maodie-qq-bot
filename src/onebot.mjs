import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export class OneBotClient {
  constructor(config, { onEvent, onDisconnect, log = console.log }) {
    this.config = config;
    this.onEvent = onEvent;
    this.onDisconnect = onDisconnect;
    this.log = log;
    this.pending = new Map();
    this.ready = false;
    this.stopped = false;
    this.fatal = false;
    this.abort = new AbortController();
  }
  request(action, params = {}, timeoutMs = 12000) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('QQ 连接未就绪'));
    const echo = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error('QQ 接口回执超时，结果未知'));
      }, timeoutMs);
      this.pending.set(echo, { resolve, reject, timer });
      ws.send(JSON.stringify({ action, params, echo }), error => {
        if (error && this.pending.has(echo)) {
          clearTimeout(timer);
          this.pending.delete(echo);
          reject(new Error('QQ 消息提交失败，结果未知'));
        }
      });
    });
  }
  async send(groupId, message, { timeoutMs = 12000 } = {}) {
    if (!this.ready) throw new Error('QQ 连接未就绪');
    const data = await this.request('send_group_msg', { group_id: Number(groupId), message }, timeoutMs);
    if (data?.message_id == null) throw new Error('QQ 回执缺少消息编号，结果未知');
    return data;
  }
  connectOnce() {
    return new Promise(resolve => {
      const headers = this.config.onebot.token ? { Authorization: `Bearer ${this.config.onebot.token}` } : {};
      const ws = new WebSocket(this.config.onebot.url, { headers, handshakeTimeout: 12000, maxPayload: 1024 * 1024 });
      this.ws = ws;
      this.ready = false;
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) return ws.terminate();
        alive = false;
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 30000);
      ws.on('pong', () => { alive = true; });
      ws.on('open', async () => {
        try {
          const login = await this.request('get_login_info');
          if (String(login?.user_id) !== this.config.selfId) {
            this.fatal = true;
            this.log('登录 QQ 与配置的小号不一致，已停止。请让 NapCat 登录配置中的小号，或修改连接地址。');
            ws.close();
            return;
          }
          if (this.stopped || ws.readyState !== WebSocket.OPEN) return;
          this.ready = true;
          this.log('QQ 小号已连接并核对账号，正在监听指定群和机器人。');
        } catch (error) {
          this.log(`QQ 登录信息核对失败：${error.message}`);
          ws.close();
        }
      });
      ws.on('message', buffer => {
        let data;
        try { data = JSON.parse(buffer.toString()); } catch { return; }
        if (!data || typeof data !== 'object') return;
        const waiting = this.pending.get(data.echo);
        if (waiting) {
          clearTimeout(waiting.timer);
          this.pending.delete(data.echo);
          if (data.status === 'ok' && data.retcode === 0) waiting.resolve(data.data);
          else waiting.reject(new Error(`QQ 接口拒绝请求（retcode ${Number.isFinite(data.retcode) ? data.retcode : '未知'}）`));
        } else if (this.ready && !this.stopped) {
          Promise.resolve().then(() => this.onEvent(data)).catch(() => this.log('忽略一条无法处理的事件。'));
        }
      });
      ws.on('error', () => this.log('QQ 连接失败，请检查 NapCat 的正向 WS 地址、端口和 Token。'));
      ws.on('close', () => {
        clearInterval(heartbeat);
        this.ready = false;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('QQ 已断开，提交结果未知')); }
        this.pending.clear();
        this.onDisconnect?.();
        resolve();
      });
    });
  }
  async run() {
    let wait = 1000;
    while (!this.stopped && !this.fatal) {
      const started = Date.now();
      await this.connectOnce();
      if (this.stopped || this.fatal) break;
      if (Date.now() - started > 60000) wait = 1000;
      this.log(`QQ 已断开，${wait / 1000} 秒后重连；未发出的内容已取消。`);
      try { await delay(wait, undefined, { signal: this.abort.signal }); } catch { break; }
      wait = Math.min(wait * 2, 30000);
    }
  }
  stop() {
    this.stopped = true;
    this.ready = false;
    this.onDisconnect?.();
    this.abort.abort();
    this.ws?.terminate();
  }
}
