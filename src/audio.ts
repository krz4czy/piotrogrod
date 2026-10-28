export class AudioBus {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private step = 0;
  music = 0.35;
  sfx = 0.75;
  private started = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.gain.value = this.music * 0.18;
    this.sfxGain.gain.value = this.sfx;
    this.musicGain.connect(ctx.destination);
    this.sfxGain.connect(ctx.destination);
    return ctx;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.started) {
      this.started = true;
      this.loop();
    }
  }

  setMusic(v: number): void {
    this.music = v;
    if (this.musicGain) this.musicGain.gain.value = v * 0.18;
  }

  setSfx(v: number): void {
    this.sfx = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  private loop = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    if (this.music > 0.01) {
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33];
      const bass = [196, 220, 246.94, 220];
      const now = ctx.currentTime + 0.02;
      this.tone(scale[this.step % scale.length], now, 0.42, 'triangle', this.musicGain, 0.18);
      if (this.step % 2 === 0) this.tone(bass[(this.step / 2) % bass.length], now, 0.7, 'sine', this.musicGain, 0.12);
      this.step += 1;
    }
    window.setTimeout(this.loop, 520);
  };

  play(name?: string): void {
    if (!name || this.sfx <= 0.01) return;
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const g = this.sfxGain;
    if (name === 'dig') {
      this.tone(140, now, 0.12, 'square', g, 0.2);
      this.tone(90, now + 0.05, 0.1, 'triangle', g, 0.15);
    } else if (name === 'water') {
      this.tone(620, now, 0.08, 'sine', g, 0.08);
      this.tone(880, now + 0.06, 0.1, 'sine', g, 0.06);
    } else if (name === 'plant' || name === 'ok') {
      this.tone(520, now, 0.08, 'triangle', g, 0.1);
      this.tone(780, now + 0.07, 0.12, 'triangle', g, 0.08);
    } else if (name === 'coin') {
      this.tone(880, now, 0.08, 'square', g, 0.05);
      this.tone(1320, now + 0.06, 0.12, 'square', g, 0.04);
    } else if (name === 'hit') {
      this.tone(220, now, 0.09, 'sawtooth', g, 0.08);
    } else if (name === 'hurt') {
      this.tone(160, now, 0.16, 'sawtooth', g, 0.1);
      this.tone(90, now + 0.05, 0.18, 'square', g, 0.06);
    } else if (name === 'quest' || name === 'magic') {
      this.tone(523, now, 0.1, 'triangle', g, 0.08);
      this.tone(659, now + 0.08, 0.12, 'triangle', g, 0.07);
      this.tone(784, now + 0.16, 0.16, 'triangle', g, 0.07);
    } else if (name === 'build') {
      this.tone(200, now, 0.1, 'square', g, 0.08);
      this.tone(300, now + 0.08, 0.14, 'triangle', g, 0.08);
    } else if (name === 'bad') {
      this.tone(180, now, 0.1, 'square', g, 0.06);
    } else if (name === 'ui') {
      this.tone(660, now, 0.05, 'sine', g, 0.05);
    }
  }

  private tone(freq: number, when: number, dur: number, type: OscillatorType, dest: GainNode, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.02);
  }
}
