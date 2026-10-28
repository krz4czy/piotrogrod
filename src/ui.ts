import { t } from './i18n.ts';
import type { TutorBox, TutorModel } from './tutorial.ts';
import type { JoySide, Settings } from './settings.ts';
import type { MapId, Role } from './types.ts';

export interface HudModel {
  coins: number;
  level: number;
  hp: number;
  maxHp: number;
  partnerHp: number;
  partnerMax: number;
  partnerNote: string;
  water: string;
  xp: number;
  code: string;
  tracker: string;
  link: 'ok' | 'wait' | 'off';
  side: JoySide;
}

export interface DockButton {
  id: string;
  label: string;
  enabled: boolean;
  reason: string;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS: Record<string, string> = {
  kop: svg('<path fill="currentColor" d="M3 20.5 8.2 15l1.6 1.6L4.6 22H3v-1.5Zm9.2-9.2 6.4-6.4a2 2 0 0 1 2.8 2.8l-6.4 6.4-2.8-2.8Z"/><path fill="currentColor" d="M11.2 13.4 8.4 16.2l-1.4-1.4 2.8-2.8 1.4 1.4Z"/>'),
  siej: svg('<path fill="currentColor" d="M12 21V11"/><path fill="currentColor" d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Z"/><circle cx="12" cy="6" r="1.6" fill="currentColor"/>'),
  przytnij: svg('<path fill="currentColor" d="M7 4.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Zm10 0a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4ZM8.6 9.2 20 20.6l-1.4 1.4L7.2 10.6l1.4-1.4Zm6.8 0 1.4 1.4L4 21.4 2.6 20 15.4 9.2Z"/>'),
  buduj: svg('<path fill="currentColor" d="M3 19h10v2H3v-2Zm1-3 8-8 2 2-8 8H4v-2Zm9.2-9.2 1.6-1.6a1.5 1.5 0 0 1 2.1 2.1l-1.6 1.6-2.1-2.1Z"/>'),
  gon: svg('<path fill="currentColor" d="M4 16c2-4 4-6 8-6h2l2 2-2 1h-2c-2 0-3.5 1-5 3H4Zm10-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>'),
  zbierz: svg('<path fill="currentColor" d="M6 9h12l-1 11H7L6 9Zm2-3h8l1 3H7l1-3Z"/>'),
  podlej: svg('<path fill="currentColor" d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z"/>'),
  nawoz: svg('<path fill="currentColor" d="M5 16c2-4 4-5 7-5 2 4 2 7 0 9-3 0-6-1-7-4Zm9-8c1.5 1 2 2.5 2 4-2 .2-3.5-.4-4.5-1.6C12.2 8.6 13 7.4 14 8Z"/>'),
  lecz: svg('<path fill="currentColor" d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z"/>'),
  krzyzuj: svg('<path fill="currentColor" d="M12 13c-2.5 2.2-5 2-6.2.6C4.4 12 5 9.5 7.2 8.2 8.6 7.4 10.4 7.6 12 8.6c1.6-1 3.4-1.2 4.8-.4C19 9.5 19.6 12 18.2 13.6 17 15 14.5 15.2 12 13Z"/><circle cx="12" cy="12.2" r="1.3" fill="#fff6ea"/>'),
  atak: svg('<path fill="currentColor" d="M4 18 14 4l2 1-7 8 6 1-11 4Z"/>'),
  ocuc: svg('<path fill="currentColor" d="M12 3 13.6 8.4 19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/>'),
  szarza: svg('<path fill="currentColor" d="M3 12h8l-2-3 6 3-6 3 2-3H3v0Zm10 0h3M18 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pylek: svg('<circle cx="8" cy="10" r="2" fill="currentColor"/><circle cx="14" cy="8" r="1.6" fill="currentColor"/><circle cx="15" cy="14" r="2.2" fill="currentColor"/><circle cx="10" cy="15" r="1.3" fill="currentColor"/>'),
  uzdrow: svg('<path fill="currentColor" d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z"/>'),
  napelnij: svg('<path fill="currentColor" d="M8 3h8v3H8V3Zm1 5h6l1 12H8L9 8Z"/>'),
  oslon: svg('<path fill="currentColor" d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z"/>'),
  zabezpiecz: svg('<path fill="currentColor" d="M4 16h16v3H4v-3Zm1-2 3-8h8l3 8H5Z"/>'),
  jajka: svg('<path fill="currentColor" d="M12 4c3 0 6 4 6 8.5A6 6 0 0 1 6 12.5C6 8 9 4 12 4Z"/>'),
  wydobadz: svg('<path fill="currentColor" d="M4 18h8v2H4v-2Zm2-2 7-8 2 2-7 8H6v-2Z"/>'),
  rozmowa: svg('<path fill="currentColor" d="M5 5h14v10H8l-3 3V5Z"/>'),
  usiadz: svg('<path fill="currentColor" d="M5 11h14v2H5v-2Zm2 2h2v6H7v-6Zm8 0h2v6h-2v-6Z"/>'),
  wstan: svg('<circle cx="12" cy="6" r="2.2" fill="currentColor"/><path fill="currentColor" d="M10 10h4l1 5h-2v5h-2v-5H9l1-5Z"/>'),
  uzyj: svg('<path fill="currentColor" d="M6 10h8l4 4-5 5-7-7V10Z"/>'),
};
export const ICON = {
  coin: svg('<circle cx="12" cy="12" r="8" fill="#ffc83d"/><circle cx="12" cy="12" r="5" fill="none" stroke="#a86b12" stroke-width="1.6"/>'),
  drop: svg('<path fill="#3aa7ff" d="M12 4s5 5 5 8a5 5 0 0 1-10 0c0-3 5-8 5-8Z"/>'),
  menu: svg('<path fill="currentColor" d="M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z"/>'),
  heart: svg('<path fill="currentColor" d="M12 19s-7-4.2-7-8.2A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.8C19 14.8 12 19 12 19Z"/>'),
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

export class GameUI {
  readonly root: HTMLElement;
  readonly toasts: HTMLElement;
  readonly screen: HTMLElement;
  readonly hud: HTMLElement;
  readonly dock: HTMLElement;
  readonly sheet: HTMLElement;
  readonly banner: HTMLElement;
  readonly joy: HTMLElement;
  readonly file: HTMLInputElement;
  readonly tutor: HTMLElement;
  onGo: (name: string, el: HTMLElement) => void = () => {};
  onTap: () => void = () => {};
  onSetting: (key: string, value: string | number | boolean) => void = () => {};
  onFile: (file: File) => void = () => {};
  private dockSig = '';
  private bannerSig = '';
  private confirmYes: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    this.root.dataset.mode = 'menu';
    this.root.dataset.side = 'lewa';
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    this.screen = document.createElement('div');
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.hidden = true;
    this.dock = document.createElement('div');
    this.dock.className = 'dock';
    this.dock.hidden = true;
    this.sheet = document.createElement('div');
    this.banner = document.createElement('div');
    this.banner.className = 'banner';
    this.banner.hidden = true;
    this.joy = document.createElement('div');
    this.joy.className = 'joy';
    this.joy.hidden = true;
    this.joy.innerHTML = '<div class="joy-base"></div><div class="joy-knob"></div>';
    this.file = document.createElement('input');
    this.file.type = 'file';
    this.file.accept = 'application/json,.json';
    this.file.hidden = true;
    this.tutor = document.createElement('div');
    this.tutor.id = 'tutor';
    this.tutor.hidden = true;
    this.root.append(this.screen, this.hud, this.dock, this.joy, this.banner, this.sheet, this.toasts, this.tutor, this.file);
    parent.appendChild(this.root);
    this.root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (!el || el.hasAttribute('disabled')) return;
      this.onTap();
      const name = el.dataset.go ?? '';
      if (name === 'confirm-yes') {
        const fn = this.confirmYes;
        this.confirmYes = null;
        this.closeSheet();
        fn?.();
        return;
      }
      if (name === 'confirm-no' || name === 'close') {
        this.confirmYes = null;
        this.closeSheet();
        if (name === 'close') this.onGo('close', el);
        return;
      }
      this.onGo(name, el);
    });
    this.root.addEventListener('input', (ev) => {
      const el = ev.target as HTMLInputElement;
      if (!el.dataset.set) return;
      if (el.type === 'range') this.onSetting(el.dataset.set, Number(el.value));
      if (el.type === 'checkbox') this.onSetting(el.dataset.set, el.checked);
    });
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (f) this.onFile(f);
    });
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    window.setTimeout(() => el.remove(), 3200);
  }

  setMode(mode: 'menu' | 'play'): void {
    this.root.dataset.mode = mode;
    const play = mode === 'play';
    this.hud.hidden = !play;
    this.dock.hidden = !play;
    if (!play) {
      this.banner.hidden = true;
      this.bannerSig = '';
      this.hideJoy();
    }
  }

  showMenu(opts: { canContinue: boolean; resumeCode: string }): void {
    this.closeSheet();
    this.setMode('menu');
    const resume = opts.resumeCode
      ? `<button class="btn soft" type="button" data-go="resume">${esc(t('menu.resume', { code: opts.resumeCode }))}</button>`
      : '';
    this.screen.innerHTML = `
      <div class="screen">
        <h1 class="logo">Piotrogród</h1>
        <p class="tag">${esc(t('menu.tag'))}</p>
        <div class="panel">
          <button class="btn" type="button" data-go="new">${esc(t('menu.new'))}</button>
          <button class="btn alt" type="button" data-go="continue" ${opts.canContinue ? '' : 'disabled'}>${esc(t('menu.continue'))}</button>
          ${opts.canContinue ? '' : `<p class="hint">${esc(t('menu.noSave'))}</p>`}
          <button class="btn alt" type="button" data-go="join">${esc(t('menu.join'))}</button>
          ${resume}
          <button class="btn soft" type="button" data-go="settings">${esc(t('menu.settings'))}</button>
          <button class="btn soft" type="button" data-go="credits">${esc(t('menu.credits'))}</button>
        </div>
      </div>`;
  }

  showRoles(title: string): void {
    this.closeSheet();
    this.setMode('menu');
    this.screen.innerHTML = `
      <div class="screen">
        <h1 class="logo">Piotrogród</h1>
        <div class="panel">
          <h2>${esc(title)}</h2>
          <div class="roles">
            <button class="role" type="button" data-go="role" data-role="ogrodnik">
              <b>${esc(t('role.ogrodnik'))}</b>
              <span>${esc(t('role.ogrodnik.desc'))}</span>
            </button>
            <button class="role her" type="button" data-go="role" data-role="zielarka">
              <b>${esc(t('role.zielarka'))}</b>
              <span>${esc(t('role.zielarka.desc'))}</span>
            </button>
          </div>
          <button class="btn soft" type="button" data-go="back">${esc(t('settings.back'))}</button>
        </div>
      </div>`;
  }

  showJoin(): void {
    this.closeSheet();
    this.setMode('menu');
    this.screen.innerHTML = `
      <div class="screen">
        <h1 class="logo">Piotrogród</h1>
        <div class="panel">
          <h2>${esc(t('join.title'))}</h2>
          <input class="code-in" id="room-code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="${esc(t('join.ph'))}" aria-label="${esc(t('join.title'))}" />
          <p class="hint">${esc(t('join.need'))}</p>
          <button class="btn" type="button" data-go="code-next">${esc(t('join.go'))}</button>
          <button class="btn soft" type="button" data-go="back">${esc(t('settings.back'))}</button>
        </div>
      </div>`;
    this.screen.querySelector<HTMLInputElement>('#room-code')?.focus();
  }

  roomCode(): string {
    return (this.screen.querySelector<HTMLInputElement>('#room-code')?.value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  showWait(text: string): void {
    this.setMode('menu');
    this.screen.innerHTML = `
      <div class="screen">
        <h1 class="logo">Piotrogród</h1>
        <div class="panel">
          <h2>${esc(text)}</h2>
          <p class="hint">${esc(t('lobby.connecting'))}</p>
        </div>
      </div>`;
  }

  showLobby(code: string, partner: boolean): void {
    this.closeSheet();
    this.setMode('menu');
    this.screen.innerHTML = `
      <div class="screen">
        <h1 class="logo">Piotrogród</h1>
        <div class="panel">
          <h2>${esc(t('lobby.title'))}</h2>
          <div class="code" data-go="copy">${esc(code)}</div>
          <p class="hint">${esc(partner ? t('lobby.partner') : t('lobby.wait'))}</p>
          <p class="hint">${esc(t('lobby.alone'))}</p>
          <button class="btn alt" type="button" data-go="copy">${esc(t('lobby.copy'))}</button>
          <button class="btn" type="button" data-go="enter">${esc(t('lobby.enter'))}</button>
        </div>
      </div>`;
  }

  showPlay(): void {
    this.screen.innerHTML = '';
    this.setMode('play');
  }

  ask(message: string, yes: string, no: string, onYes: () => void): void {
    this.confirmYes = onYes;
    this.sheet.innerHTML = `
      <div class="sheet">
        <p class="pre">${esc(message)}</p>
        <button class="btn warn" type="button" data-go="confirm-yes">${esc(yes)}</button>
        <button class="btn soft" type="button" data-go="confirm-no">${esc(no)}</button>
      </div>`;
    this.root.dataset.sheet = '1';
  }

  closeSheet(): void {
    this.sheet.innerHTML = '';
    this.root.dataset.sheet = '0';
  }

  sheetOpen(): boolean {
    return this.root.dataset.sheet === '1';
  }

  showPause(): void {
    const items: [string, string][] = [
      ['resume-play', t('pause.resume')],
      ['inv', t('pause.inv')],
      ['char', t('pause.char')],
      ['quests', t('pause.quests')],
      ['map', t('pause.map')],
      ['shop', t('pause.shop')],
      ['settings', t('pause.settings')],
      ['save', t('pause.save')],
      ['export', t('pause.export')],
      ['import', t('pause.import')],
      ['help', t('pause.help')],
      ['credits', t('menu.credits')],
      ['menu-exit', t('pause.menu')],
    ];
    this.fillSheet(`<h2>${esc(t('pause.title'))}</h2>` + items.map(([id, label]) =>
      `<button class="btn ${id === 'menu-exit' ? 'warn' : id === 'resume-play' ? '' : 'alt'}" type="button" data-go="${id}">${esc(label)}</button>`,
    ).join(''));
  }

  showText(title: string, body: string): void {
    this.fillSheet(`<h2>${esc(title)}</h2><p class="pre">${esc(body)}</p><button class="btn" type="button" data-go="close">${esc(t('settings.back'))}</button>`);
  }

  showSettings(s: Settings, fromPlay: boolean): void {
    const seg = (key: string, cur: string, opts: [string, string][]) =>
      `<div class="seg">${opts.map(([v, label]) =>
        `<button class="btn tiny ${cur === v ? '' : 'alt'}" type="button" data-go="set" data-key="${key}" data-val="${v}">${esc(label)}</button>`,
      ).join('')}</div>`;
    this.fillSheet(`
      <h2>${esc(t('settings.title'))}</h2>
      <label class="check"><input type="checkbox" data-set="musicOn" ${s.musicOn ? 'checked' : ''} />${esc(t('settings.musicOn'))}</label>
      <label class="slide">${esc(t('settings.music'))}<input type="range" min="0" max="1" step="0.01" data-set="music" value="${s.music}" /></label>
      <label class="slide">${esc(t('settings.sfx'))}<input type="range" min="0" max="1" step="0.01" data-set="sfx" value="${s.sfx}" /></label>
      <label class="check"><input type="checkbox" data-set="vibration" ${s.vibration ? 'checked' : ''} />${esc(t('settings.vib'))}</label>
      <div>${esc(t('settings.gfx'))}</div>
      ${seg('quality', s.quality, [['niska', t('settings.low')], ['srednia', t('settings.mid')], ['wysoka', t('settings.high')]])}
      <div>${esc(t('settings.side'))}</div>
      ${seg('joystickSide', s.joystickSide, [['lewa', t('settings.left')], ['prawa', t('settings.right')]])}
      <div>${esc(t('settings.size'))}</div>
      ${seg('joystickSize', s.joystickSize, [['mala', t('settings.small')], ['srednia', t('settings.medium')], ['duza', t('settings.large')]])}
      <div>${esc(t('settings.lang'))}</div>
      <button class="btn tiny" type="button" disabled>${esc(t('settings.pl'))}</button>
      <button class="btn alt" type="button" data-go="tutorial">${esc(t('settings.tutorial'))}</button>
      <button class="btn alt" type="button" data-go="fullscreen">${esc(t('settings.full'))}</button>
      <button class="btn" type="button" data-go="${fromPlay ? 'pause' : 'close'}">${esc(t('settings.back'))}</button>
    `);
  }

  private fillSheet(inner: string): void {
    this.sheet.innerHTML = `<div class="sheet">${inner}</div>`;
    this.root.dataset.sheet = '1';
  }

  setHud(m: HudModel): void {
    this.root.dataset.side = m.side;
    if (!this.hud.dataset.ready) {
      this.hud.dataset.ready = '1';
      this.hud.innerHTML = `
        <div class="row">
          <button class="iconbtn" type="button" data-go="pause" aria-label="${esc(t('pause.title'))}">${ICON.menu}</button>
          <div class="bars" id="hud-hp" data-go="tut-hp" role="button" aria-label="${esc(t('hud.you'))}">
            <div class="bar" title="${esc(t('hud.you'))}"><span id="hp-me"></span></div>
            <div class="bar xp" title="XP"><span id="xp-me"></span></div>
            <div class="bar partner" title="${esc(t('hud.partner'))}"><span id="hp-you"></span></div>
          </div>
          <button class="chip" type="button" data-go="copy" id="hud-coins"></button>
        </div>
        <div class="row">
          <button class="chip" type="button" data-go="copy" id="hud-code"></button>
          <span class="chip" id="hud-lvl"></span>
          <span class="chip" id="hud-water" hidden></span>
          <span class="chip" id="hud-link"><i class="dot" id="hud-dot"></i><span id="hud-partner"></span></span>
        </div>
        <button class="tracker" type="button" data-go="quests" id="hud-quest"></button>`;
    }
    const me = this.hud.querySelector<HTMLElement>('#hp-me');
    const you = this.hud.querySelector<HTMLElement>('#hp-you');
    if (me) me.style.width = `${Math.max(0, Math.min(100, (m.hp / Math.max(1, m.maxHp)) * 100))}%`;
    if (you) you.style.width = `${Math.max(0, Math.min(100, (m.partnerHp / Math.max(1, m.partnerMax)) * 100))}%`;
    const xp = this.hud.querySelector<HTMLElement>('#xp-me');
    if (xp) xp.style.width = `${Math.max(0, Math.min(100, m.xp * 100))}%`;
    const coins = this.hud.querySelector('#hud-coins');
    if (coins) coins.innerHTML = `${ICON.coin}<span>${m.coins}</span>`;
    const code = this.hud.querySelector('#hud-code');
    if (code) code.textContent = `${t('hud.code')} ${m.code}`;
    const lvl = this.hud.querySelector('#hud-lvl');
    if (lvl) lvl.textContent = t('hud.lvl', { n: m.level });
    const water = this.hud.querySelector<HTMLElement>('#hud-water');
    if (water) {
      water.hidden = !m.water;
      water.innerHTML = m.water ? `${ICON.drop}<span>${esc(m.water)}</span>` : '';
    }
    const dot = this.hud.querySelector('#hud-dot');
    if (dot) dot.className = `dot ${m.link}`;
    const partner = this.hud.querySelector('#hud-partner');
    if (partner) partner.textContent = m.partnerNote;
    const quest = this.hud.querySelector('#hud-quest');
    if (quest) quest.textContent = m.tracker;
  }

  setDock(actions: DockButton[], showHeart: boolean): void {
    const sig = actions.map((a) => `${a.id}:${a.enabled}:${a.label}`).join('|') + (showHeart ? ':h' : '');
    if (sig === this.dockSig) return;
    this.dockSig = sig;
    const heart = showHeart ? `<button class="act heart" type="button" data-go="emote" aria-label="${esc(t('toast.emote'))}"><i>${ICON.heart}</i></button>` : '';
    this.dock.innerHTML = heart + actions.map((a) =>
      `<button class="act ${a.enabled ? '' : 'off'}" type="button" data-go="act" data-id="${esc(a.id)}" data-on="${a.enabled ? '1' : '0'}" data-reason="${esc(a.reason)}"><i>${ICONS[a.id] ?? '•'}</i>${esc(a.label)}</button>`,
    ).join('');
  }

  showJoy(x: number, y: number, kx: number, ky: number, radius: number): void {
    this.joy.hidden = false;
    const base = Math.round(radius * 2);
    this.joy.style.width = `${base}px`;
    this.joy.style.height = `${base}px`;
    this.joy.style.marginLeft = `${-base / 2}px`;
    this.joy.style.marginTop = `${-base / 2}px`;
    this.joy.style.left = `${x}px`;
    this.joy.style.top = `${y}px`;
    const knob = this.joy.querySelector<HTMLElement>('.joy-knob');
    if (knob) {
      const size = Math.round(radius * 0.72);
      knob.style.width = `${size}px`;
      knob.style.height = `${size}px`;
      knob.style.left = `${base / 2 - size / 2 + kx}px`;
      knob.style.top = `${base / 2 - size / 2 + ky}px`;
    }
  }

  hideJoy(): void {
    this.joy.hidden = true;
  }

  setBanner(sig: string, html: string | null): void {
    if (this.sheetOpen()) {
      if (this.bannerSig !== 'sheet') {
        this.banner.hidden = true;
        this.banner.innerHTML = '';
        this.bannerSig = 'sheet';
      }
      return;
    }
    if (sig === this.bannerSig) return;
    this.bannerSig = sig;
    if (!html) {
      this.banner.hidden = true;
      this.banner.innerHTML = '';
      return;
    }
    this.banner.hidden = false;
    this.banner.innerHTML = html;
  }

  showInv(html: string): void { this.fillSheet(html); }
  showChar(html: string): void { this.fillSheet(html); }
  showQuests(html: string): void { this.fillSheet(html); }
  showMap(html: string): void { this.fillSheet(html); }
  showShop(html: string): void { this.fillSheet(html); }
  showDialog(html: string): void { this.fillSheet(html); }
  showSeeds(html: string): void { this.fillSheet(html); }
  showBuild(html: string): void { this.fillSheet(html); }

  pickImport(): void { this.file.click(); }

  setTutor(model: TutorModel | null): void {
    if (!model) {
      this.tutor.hidden = true;
      this.tutor.innerHTML = '';
      this.tutor.dataset.sig = '';
      this.root.dataset.tutor = '0';
      return;
    }
    this.root.dataset.tutor = '1';
    const sig = `${model.step}|${model.n}|${model.say}|${model.ask}`;
    if (this.tutor.dataset.sig === sig) return;
    this.tutor.dataset.sig = sig;
    this.tutor.hidden = false;
    const ask = model.ask ? `<p class="ask">${esc(model.ask)}</p>` : '';
    this.tutor.innerHTML = `
      <div class="ring" hidden></div>
      <div class="bubble">
        <div class="who"><i></i><span>Wójt Stanisław</span><b>${esc(t('tutor.progress', { n: model.n, total: model.total }))}</b></div>
        <p class="say">${esc(model.say)}</p>
        ${ask}
        <button class="btn soft skip" type="button" data-go="tutor-skip">${esc(t('tutor.skip'))}</button>
      </div>`;
  }

  placeTutor(ring: TutorBox | null, bubble: { left: number; top: number }): void {
    const box = this.tutor.querySelector<HTMLElement>('.bubble');
    const mark = this.tutor.querySelector<HTMLElement>('.ring');
    if (box) {
      box.style.left = `${bubble.left}px`;
      box.style.top = `${bubble.top}px`;
    }
    if (!mark) return;
    if (!ring) {
      mark.hidden = true;
      return;
    }
    mark.hidden = false;
    mark.style.left = `${ring.left}px`;
    mark.style.top = `${ring.top}px`;
    mark.style.width = `${ring.width}px`;
    mark.style.height = `${ring.height}px`;
  }
}

export function roleName(role: Role): string {
  return t('role.' + role);
}

export function mapName(id: MapId): string {
  return t('map.' + id);
}

export { esc };
