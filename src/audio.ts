const BASE = import.meta.env.BASE_URL || './';

/** Short CC0 recordings. Keys are the names `play()` accepts. */
const FILES: Record<string, string> = {
  ui: 'ui.mp3',
  bad: 'bad.mp3',
  dig: 'dig.mp3',
  sow: 'sow.mp3',
  water: 'water.mp3',
  fert: 'fert.mp3',
  prune: 'prune.mp3',
  harvest: 'harvest.mp3',
  build: 'build.mp3',
  heal: 'heal.mp3',
  cross: 'cross.mp3',
  magic: 'magic.mp3',
  hit: 'hit.mp3',
  hurt: 'hurt.mp3',
  death: 'death.mp3',
  pickup: 'pickup.mp3',
  coin: 'coin.mp3',
  level: 'level.mp3',
  quest: 'quest.mp3',
  questdone: 'questdone.mp3',
  join: 'join.mp3',
  step0: 'step0.mp3',
  step1: 'step1.mp3',
  step2: 'step2.mp3',
  music: 'music.mp3',
};

const ALIAS: Record<string, string> = {
  plant: 'sow',
  ok: 'quest',
};

const GAIN: Record<string, number> = {
  ui: 0.42,
  bad: 0.45,
  dig: 0.72,
  sow: 0.55,
  water: 0.62,
  fert: 0.55,
  prune: 0.6,
  harvest: 0.62,
  build: 0.68,
  heal: 0.5,
  cross: 0.5,
  magic: 0.48,
  hit: 0.62,
  hurt: 0.7,
  death: 0.72,
  pickup: 0.55,
  coin: 0.58,
  level: 0.52,
  quest: 0.5,
  questdone: 0.52,
  join: 0.55,
  step0: 0.22,
  step1: 0.22,
  step2: 0.22,
};

function assetUrl(file: string): string {
  return `${BASE}audio/${file}`;
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private raw = new Map<string, ArrayBuffer>();
  private pending: string[] = [];
  private lastAt = new Map<string, number>();
  private fetchP: Promise<void> | null = null;
  private decoding = false;
  private ready = false;
  private stepI = 0;
  private stepAt = 0;
  music = 0.35;
  musicOn = true;
  sfx = 0.75;

  constructor() {
    void this.fetchAll();
  }

  /** Create/resume the context inside a user gesture (required on iOS Safari). */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.kick();
    const silent = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start();
  }

  setMusic(v: number): void {
    this.music = v;
    this.applyMusic();
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on;
    this.applyMusic();
  }

  setSfx(v: number): void {
    this.sfx = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  play(name?: string): void {
    if (!name || this.sfx <= 0.01) return;
    const id = ALIAS[name] ?? name;
    if (!FILES[id] || id === 'music') return;
    if (!this.ready || !this.buffers.has(id)) {
      if (this.pending.length < 6) this.pending.push(id);
      this.unlock();
      return;
    }
    const now = performance.now();
    const prev = this.lastAt.get(id) ?? 0;
    if (now - prev < 80) return;
    this.lastAt.set(id, now);
    this.playBuffer(id, GAIN[id] ?? 0.5);
  }

  /** Subtle grass steps while the local player is walking. */
  step(): void {
    if (this.sfx <= 0.01) return;
    const now = performance.now();
    if (now - this.stepAt < 380) return;
    this.stepAt = now;
    const id = `step${this.stepI % 3}`;
    this.stepI += 1;
    if (!this.ready || !this.buffers.has(id)) return;
    this.playBuffer(id, GAIN[id] ?? 0.22);
  }

  private playBuffer(id: string, vol: number): void {
    const ctx = this.ctx;
    const bus = this.sfxGain;
    const buf = this.buffers.get(id);
    if (!ctx || !bus || !buf) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g);
    g.connect(bus);
    src.start();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? this.music * 0.5 : 0;
    this.sfxGain.gain.value = this.sfx;
    this.musicGain.connect(ctx.destination);
    this.sfxGain.connect(ctx.destination);
    return ctx;
  }

  private applyMusic(): void {
    if (!this.musicGain || !this.ctx) return;
    const v = this.musicOn ? Math.max(0, this.music) * 0.5 : 0;
    this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
  }

  private kick(): void {
    void this.fetchAll().then(() => this.decodeAll());
  }

  private fetchAll(): Promise<void> {
    if (!this.fetchP) this.fetchP = this.loadFiles();
    return this.fetchP;
  }

  private async loadFiles(): Promise<void> {
    await Promise.all(Object.entries(FILES).map(async ([id, file]) => {
      try {
        const res = await fetch(assetUrl(file));
        if (!res.ok) throw new Error(String(res.status));
        this.raw.set(id, await res.arrayBuffer());
      } catch (err) {
        console.warn('audio missing', file, err);
      }
    }));
  }

  private async decodeAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.decoding || this.ready) return;
    if (this.raw.size === 0) return;
    this.decoding = true;
    await Promise.all([...this.raw.entries()].map(async ([id, data]) => {
      if (this.buffers.has(id)) return;
      try {
        const buf = await ctx.decodeAudioData(data.slice(0));
        this.buffers.set(id, buf);
      } catch (err) {
        console.warn('audio decode', id, err);
      }
    }));
    this.decoding = false;
    if (this.buffers.size === 0) return;
    this.ready = true;
    this.startMusic();
    const queued = this.pending.splice(0, this.pending.length);
    for (const id of queued) this.play(id);
  }

  private startMusic(): void {
    const ctx = this.ctx;
    const bus = this.musicGain;
    const buf = this.buffers.get('music');
    if (!ctx || !bus || !buf || this.musicSrc) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bus);
    src.start();
    this.musicSrc = src;
    this.applyMusic();
  }
}
