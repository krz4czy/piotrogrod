import Peer, { type DataConnection } from 'peerjs';

export type NetMsg = Record<string, unknown> & { t: string };

export function peerIdFor(code: string): string {
  return `piotrogrod-${code.toUpperCase()}`;
}

export class Net {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  isHost = false;
  code = '';
  onMessage: (msg: NetMsg) => void = () => {};
  onReady: () => void = () => {};
  onConnected: () => void = () => {};
  onDisconnected: () => void = () => {};
  onError: (type: string, message: string) => void = () => {};
  /** Signaling socket died after the peer id was open. */
  onSignalLost: () => void = () => {};
  /** Host: decide whether an incoming hello may take the open seat. */
  admit: (msg: NetMsg) => boolean = () => true;
  private queue: NetMsg[] = [];
  private destroyed = false;

  destroy(): void {
    this.destroyed = true;
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.conn = null;
    this.peer = null;
    this.queue = [];
  }

  host(code: string, peerId?: string): Promise<void> {
    this.destroy();
    this.destroyed = false;
    this.isHost = true;
    this.code = code.toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerId || peerIdFor(this.code), { debug: 0 });
      this.peer = peer;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled || this.destroyed) return;
        settled = true;
        reject(new Error('timeout'));
        try { peer.destroy(); } catch { /* ignore */ }
      }, 10000);
      peer.on('open', () => {
        if (this.destroyed) return;
        window.clearTimeout(timer);
        settled = true;
        resolve();
        this.onReady();
      });
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (this.destroyed) return;
        const type = err.type ?? 'error';
        window.clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error(type));
        } else if (type === 'network' || type === 'socket-error' || type === 'socket-closed' || type === 'disconnected' || type === 'server-error' || type === 'unavailable-id') {
          this.onSignalLost();
        }
        this.onError(type, err.message ?? type);
      });
      peer.on('connection', (conn) => this.watchIncoming(conn));
      peer.on('disconnected', () => {
        if (!this.destroyed && !peer.destroyed) peer.reconnect();
      });
    });
  }

  join(code: string, peerId?: string, timeoutMs = 9000): Promise<void> {
    this.destroy();
    this.destroyed = false;
    this.isHost = false;
    this.code = code.toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let settled = false;
      let timer = 0;
      const fail = (type: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(type));
      };
      timer = window.setTimeout(() => fail('timeout'), timeoutMs);
      peer.on('open', () => {
        if (this.destroyed || settled) return;
        const conn = peer.connect(peerId || peerIdFor(this.code), { reliable: true });
        this.attach(conn);
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve();
        });
      });
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (this.destroyed) return;
        const type = err.type ?? 'error';
        fail(type);
        this.onError(type, err.message ?? type);
      });
    });
  }

  private watchIncoming(conn: DataConnection): void {
    const take = (data: unknown) => {
      if (this.destroyed) return;
      if (!data || typeof data !== 'object' || !('t' in (data as NetMsg))) return;
      const msg = data as NetMsg;
      if (msg.t !== 'hello') return;
      conn.off('data', take);
      if (!this.admit(msg)) {
        const rejectConn = () => {
          try { conn.send({ t: 'reject', msg: 'full' }); } catch { /* ignore */ }
          try { conn.close(); } catch { /* ignore */ }
        };
        if (conn.open) rejectConn();
        else conn.once('open', rejectConn);
        return;
      }
      this.attach(conn);
      this.onMessage(msg);
    };
    conn.on('data', take);
  }

  private attach(conn: DataConnection): void {
    if (this.conn && this.conn !== conn) {
      try { this.conn.close(); } catch { /* ignore */ }
    }
    this.conn = conn;
    const opened = () => {
      if (this.conn !== conn) return;
      this.onConnected();
      for (const msg of this.queue) conn.send(msg);
      this.queue = [];
    };
    if (conn.open) opened();
    else conn.on('open', opened);
    conn.on('data', (data) => {
      if (this.conn !== conn) return;
      if (data && typeof data === 'object' && 't' in (data as NetMsg)) this.onMessage(data as NetMsg);
    });
    conn.on('close', () => {
      if (this.conn === conn) this.onDisconnected();
    });
    conn.on('error', () => {
      if (this.conn === conn && !conn.open) this.onDisconnected();
    });
  }

  send(msg: NetMsg): void {
    if (this.destroyed) return;
    if (this.conn?.open) this.conn.send(msg);
    else this.queue.push(msg);
  }
}
