import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/fredoka/latin-ext-400.css';
import '@fontsource/fredoka/latin-ext-600.css';
import '@fontsource/fredoka/latin-ext-700.css';
import './style.css';
import { AudioBus } from './audio.ts';
import {
  BUILDS,
  ITEMS,
  MAP_ORDER,
  SKILLS,
  itemName,
  questDef,
} from './content.ts';
import { t } from './i18n.ts';
import {
  applyAction,
  catchUp,
  computeStats,
  contextOf,
  createGame,
  isReady,
  isState,
  listActions,
  normalize,
  npcMarker,
  objectiveLine,
  orderRows,
  otherRole,
  previewDialog,
  seedChoices,
  shopVisible,
  simulate,
  trackerLine,
  xpNeed,
  type DialogButton,
} from './logic.ts';
import { movePlayer } from './logic.ts';
import { Net, type NetMsg } from './net.ts';
import { bindMarker, WorldView } from './render.ts';
import { joyRadius, loadSettings, saveSettings, type Settings } from './settings.ts';
import {
  clearSession,
  exportSave,
  parseImport,
  readSave,
  readSession,
  writeSave,
  writeSession,
  type SessionInfo,
} from './storage.ts';
import type { ActionMsg, EquipSlot, GameState, MapId, Role, SaveBlob } from './types.ts';
import { hypot, uid } from './util.ts';
import { esc, GameUI, type DockButton, type HudModel } from './ui.ts';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
type Phase = 'menu' | 'role' | 'join' | 'wait' | 'lobby' | 'play';
type Intent = 'new' | 'continue' | 'join' | 'resume';
type Sheet =
  | ''
  | 'pause'
  | 'inv'
  | 'char'
  | 'quests'
  | 'map'
  | 'shop'
  | 'settings'
  | 'dialog'
  | 'seeds'
  | 'build'
  | 'text'
  | 'ask';

function makeCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function takeNetState(raw: GameState): GameState {
  const connected = {
    ogrodnik: !!raw.connected?.ogrodnik,
    zielarka: !!raw.connected?.zielarka,
  };
  const invite = raw.invite ?? null;
  const s = normalize(cloneState(raw));
  s.connected = connected;
  s.invite = invite;
  return s;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

class App {
  readonly settings: Settings;
  readonly audio = new AudioBus();
  readonly view: WorldView;
  readonly ui: GameUI;
  readonly preview: GameState;
  net: Net | null = null;
  state: GameState | null = null;
  role: Role = 'ogrodnik';
  phase: Phase = 'menu';
  intent: Intent = 'new';
  host = false;
  token = '';
  code = '';
  pendingCode = '';
  guest: { role: Role; token: string } | null = null;
  swapped = false;
  noticeCursor = 0;
  savedAt = 0;
  savedRev = -1;
  lastSave = 0;
  lastBroadcast = 0;
  lastPos = 0;
  lastPing = 0;
  lastHeard = 0;
  lastSheet = 0;
  seenRev = -1;
  link: HudModel['link'] = 'wait';
  booting = false;
  sheetKind: Sheet = '';
  shopTab: 'buy' | 'sell' | 'orders' = 'buy';
  invIdx = -1;
  moving = false;
  keys = new Set<string>();
  stick = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  dialog: { npc: string; line: number; lines: string[]; buttons: DialogButton[] } | null = null;
  prev = 0;

  constructor() {
    this.settings = loadSettings();
    this.audio.setMusic(this.settings.music);
    this.audio.setMusicOn(this.settings.musicOn);
    this.audio.setSfx(this.settings.sfx);
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) throw new Error('app');
    const stage = document.createElement('div');
    stage.id = 'stage';
    const canvas = document.createElement('canvas');
    canvas.id = 'view';
    stage.appendChild(canvas);
    app.appendChild(stage);
    this.view = new WorldView(canvas);
    this.view.setQuality(this.settings.quality);
    this.ui = new GameUI(app);
    this.preview = createGame(Date.now());
    bindMarker(npcMarker);
    this.ui.onGo = (name, el) => this.onGo(name, el);
    this.ui.onTap = () => {
      this.audio.unlock();
      this.audio.play('ui');
    };
    this.ui.onSetting = (key, value) => this.onSetting(key, value);
    this.ui.onFile = (file) => void this.onFile(file);
    this.bindInput();
    this.refreshMenu();
    this.prev = performance.now();
    requestAnimationFrame(this.loop);
    window.setInterval(() => this.hiddenTick(), 1000);
  }

  private loop = (t: number): void => {
    try {
      const dt = Math.min(0.05, (t - this.prev) / 1000);
      this.prev = t;
      this.tick(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(this.loop);
  };

  private hiddenTick(): void {
    if (!document.hidden || !this.host || !this.state) return;
    if (this.phase !== 'lobby' && this.phase !== 'play') return;
    const now = Date.now();
    simulate(this.state, now, 0.05);
    this.drain();
    this.broadcast(true);
    this.saveMaybe(now);
  }

  private tick(dt: number): void {
    const now = Date.now();
    const input = this.readInput();
    this.moving = Math.hypot(input.ix, input.iz) > 0.12;
    if (this.phase === 'play' && this.moving && this.state) {
      const walker = this.state.characters[this.role];
      if (!walker.sitting && !walker.downed) this.audio.step();
    }
    if (this.state && this.host && (this.phase === 'lobby' || this.phase === 'play')) {
      if (this.phase === 'play') movePlayer(this.state, this.role, input.ix, input.iz, dt, now);
      simulate(this.state, now, dt);
      this.drain();
      this.broadcast(false);
      this.saveMaybe(now);
      this.ping(now);
    } else if (this.state && !this.host && this.phase === 'play') {
      movePlayer(this.state, this.role, input.ix, input.iz, dt, now);
      if (now - this.lastPos > 100) {
        this.lastPos = now;
        const ch = this.state.characters[this.role];
        this.net?.send({ t: 'pos', role: this.role, x: ch.x, z: ch.z, rot: ch.rot, sitting: ch.sitting });
      }
      this.ping(now);
      this.saveMaybe(now);
      this.drain();
    }
    if (this.phase === 'play' && this.lastHeard && now - this.lastHeard > 7000) this.link = 'wait';
    const backdrop = this.state ?? this.preview;
    this.view.frame(backdrop, this.state ? this.role : 'ogrodnik', dt, now, this.phase === 'play' ? 'play' : 'menu');
    if (this.phase === 'play' && this.state) {
      this.paintHud(now);
      this.paintBanner(now);
      if (this.state.rev !== this.seenRev) {
        this.seenRev = this.state.rev;
        if (this.sheetKind === 'dialog' || this.sheetKind === 'inv' || this.sheetKind === 'shop' || this.sheetKind === 'quests' || this.sheetKind === 'char') {
          this.renderSheet();
        }
      }
    }
  }

  private readInput(): { ix: number; iz: number } {
    if (this.phase !== 'play' || this.ui.sheetOpen()) return { ix: 0, iz: 0 };
    let ix = this.stick.on ? this.stick.x : 0;
    let iz = this.stick.on ? this.stick.y : 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz += 1;
    return { ix, iz };
  }

  private bindInput(): void {
    const down = (e: PointerEvent) => {
      this.audio.unlock();
      if (this.phase !== 'play' || this.ui.sheetOpen()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, .sheet, .banner, .hud, .dock')) return;
      const left = e.clientX < window.innerWidth / 2;
      const mine = this.settings.joystickSide === 'lewa' ? left : !left;
      if (!mine) return;
      e.preventDefault();
      this.stick = { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.placeStick(0, 0);
    };
    const move = (e: PointerEvent) => {
      if (!this.stick.on || e.pointerId !== this.stick.id) return;
      const r = joyRadius(this.settings.joystickSize);
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const mag = Math.hypot(dx, dy) || 1;
      const scale = mag > r ? r / mag : 1;
      dx *= scale;
      dy *= scale;
      this.stick.x = dx / r;
      this.stick.y = dy / r;
      this.placeStick(dx, dy);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.on = false;
      this.stick.x = 0;
      this.stick.y = 0;
      this.ui.hideJoy();
    };
    window.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && (e.target as HTMLElement).id === 'room-code') this.onGo('code-next', e.target as HTMLElement);
        return;
      }
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Escape' && this.phase === 'play') this.onGo(this.sheetKind === 'pause' ? 'resume-play' : 'pause', this.ui.root);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveMaybe(Date.now(), true);
    });
    window.addEventListener('pagehide', () => this.saveMaybe(Date.now(), true));
    document.addEventListener('touchmove', (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('.sheet, .dock, .panel, .scroll')) return;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private placeStick(dx: number, dy: number): void {
    const r = joyRadius(this.settings.joystickSize);
    this.ui.showJoy(this.stick.ox, this.stick.oy, dx, dy, r);
  }

  private refreshMenu(): void {
    const save = readSave();
    const session = readSession();
    const recent = !!session && Date.now() - session.at < 12 * 3600 * 1000;
    this.phase = 'menu';
    this.sheetKind = '';
    this.ui.showMenu({ canContinue: !!save, resumeCode: recent && session ? session.code : '' });
  }

  private onSetting(key: string, value: string | number | boolean): void {
    if (key === 'music') {
      this.settings.music = Number(value);
      this.audio.setMusic(this.settings.music);
    } else if (key === 'musicOn') {
      this.settings.musicOn = Boolean(value);
      this.audio.setMusicOn(this.settings.musicOn);
    } else if (key === 'sfx') {
      this.settings.sfx = Number(value);
      this.audio.setSfx(this.settings.sfx);
    } else if (key === 'vibration') {
      this.settings.vibration = Boolean(value);
    }
    saveSettings(this.settings);
  }

  private applyOption(key: string, val: string): void {
    if (key === 'quality' && (val === 'niska' || val === 'srednia' || val === 'wysoka')) {
      this.settings.quality = val;
      this.view.setQuality(val);
    } else if (key === 'joystickSide' && (val === 'lewa' || val === 'prawa')) {
      this.settings.joystickSide = val;
    } else if (key === 'joystickSize' && (val === 'mala' || val === 'srednia' || val === 'duza')) {
      this.settings.joystickSize = val;
    }
    saveSettings(this.settings);
    if (this.sheetKind === 'settings') this.ui.showSettings(this.settings, this.phase === 'play');
  }

  private onGo(name: string, el: HTMLElement): void {
    this.audio.unlock();
    if (name === 'new') {
      if (readSave()) {
        this.sheetKind = 'ask';
        this.ui.ask(t('menu.confirmNew'), t('menu.yes'), t('menu.no'), () => this.pickRole('new'));
      } else this.pickRole('new');
      return;
    }
    if (name === 'continue') {
      if (!readSave()) {
        this.ui.toast(t('menu.noSave'));
        return;
      }
      this.pickRole('continue');
      return;
    }
    if (name === 'join') {
      this.phase = 'join';
      this.intent = 'join';
      this.ui.showJoin();
      return;
    }
    if (name === 'settings') {
      this.sheetKind = 'settings';
      this.ui.showSettings(this.settings, this.phase === 'play');
      return;
    }
    if (name === 'credits') {
      this.sheetKind = 'text';
      this.ui.showText(t('credits.title'), `${t('credits.body')}\n\n${t('credits.controlsBody')}`);
      return;
    }
    if (name === 'resume') {
      const session = readSession();
      if (!session) return;
      this.intent = 'resume';
      this.role = session.role;
      if (session.host) void this.startHost(session);
      else {
        this.pendingCode = session.code;
        void this.startJoin(session);
      }
      return;
    }
    if (name === 'back') {
      this.backMenu(false);
      return;
    }
    if (name === 'role') {
      const role = el.dataset.role === 'zielarka' ? 'zielarka' : 'ogrodnik';
      this.role = role;
      if (this.intent === 'join') void this.startJoin(null);
      else void this.startHost(null);
      return;
    }
    if (name === 'code-next') {
      const code = this.ui.roomCode();
      if (code.length < 4) {
        this.ui.toast(t('join.need'));
        return;
      }
      this.pendingCode = code;
      this.pickRole('join');
      return;
    }
    if (name === 'copy') {
      void this.copyCode();
      return;
    }
    if (name === 'enter') {
      this.enterPlay();
      return;
    }
    if (name === 'pause') {
      if (this.phase !== 'play') return;
      this.sheetKind = 'pause';
      this.ui.showPause();
      return;
    }
    if (name === 'resume-play') {
      this.sheetKind = '';
      this.dialog = null;
      this.ui.closeSheet();
      return;
    }
    if (name === 'close') {
      this.sheetKind = '';
      this.dialog = null;
      return;
    }
    if (name === 'set') {
      this.applyOption(el.dataset.key ?? '', el.dataset.val ?? '');
      return;
    }
    if (name === 'fullscreen') {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      else void document.exitFullscreen?.();
      return;
    }
    if (name === 'inv' || name === 'char' || name === 'quests' || name === 'map' || name === 'shop') {
      this.sheetKind = name === 'char' ? 'char' : name === 'inv' ? 'inv' : name === 'quests' ? 'quests' : name === 'map' ? 'map' : 'shop';
      this.renderSheet();
      return;
    }
    if (name === 'save') {
      this.saveMaybe(Date.now(), true);
      this.ui.toast(t('toast.saved'));
      return;
    }
    if (name === 'export') {
      if (this.state) exportSave(this.state);
      this.ui.toast(t('toast.exported'));
      return;
    }
    if (name === 'import') {
      this.ui.pickImport();
      return;
    }
    if (name === 'help') {
      this.sheetKind = 'text';
      this.ui.showText(t('pause.help'), `${t('help.body')}\n\n${t('credits.controlsBody')}`);
      return;
    }
    if (name === 'menu-exit') {
      this.sheetKind = 'ask';
      this.ui.ask(t('pause.leaveAsk'), t('menu.yes'), t('menu.no'), () => {
        this.saveMaybe(Date.now(), true);
        this.backMenu(false);
      });
      return;
    }
    if (name === 'emote') {
      this.doAction({ id: 'emote' });
      return;
    }
    if (name === 'act') {
      this.onAct(el);
      return;
    }
    if (name === 'seed') {
      this.doAction({ id: 'siej', species: el.dataset.species ?? '' });
      this.sheetKind = '';
      this.ui.closeSheet();
      return;
    }
    if (name === 'build') {
      this.doAction({ id: 'buduj', build: el.dataset.build ?? '' });
      this.sheetKind = '';
      this.ui.closeSheet();
      return;
    }
    if (name === 'travel') {
      const map = (el.dataset.map ?? 'wies') as MapId;
      this.doAction({ id: 'travel', map, meta: el.dataset.call === '1' ? 'call' : '' });
      this.sheetKind = '';
      this.ui.closeSheet();
      return;
    }
    if (name === 'exit-go' || name === 'exit-call') {
      const map = (el.dataset.map ?? '') as MapId;
      if (!map) return;
      this.doAction({ id: 'travel', map, meta: name === 'exit-call' ? 'call' : '' });
      return;
    }
    if (name === 'invite-yes') {
      this.doAction({ id: 'accept_invite' });
      return;
    }
    if (name === 'invite-no') {
      this.doAction({ id: 'decline_invite' });
      return;
    }
    if (name === 'tab') {
      const tab = el.dataset.tab;
      if (tab === 'buy' || tab === 'sell' || tab === 'orders') this.shopTab = tab;
      this.renderSheet();
      return;
    }
    if (name === 'buy') {
      this.doAction({ id: 'buy', item: el.dataset.item ?? '' });
      return;
    }
    if (name === 'sell') {
      this.doAction({ id: 'sell', item: el.dataset.item ?? '', meta: el.dataset.meta ?? '', qty: 1 });
      return;
    }
    if (name === 'order') {
      this.doAction({ id: 'order', order: el.dataset.order ?? '' });
      return;
    }
    if (name === 'pick') {
      this.invIdx = Number(el.dataset.idx ?? -1);
      this.renderSheet();
      return;
    }
    if (name === 'equip') {
      this.doAction({ id: 'equip', item: el.dataset.item ?? '' });
      return;
    }
    if (name === 'unequip') {
      this.doAction({ id: 'unequip', item: el.dataset.slot ?? '' });
      return;
    }
    if (name === 'use') {
      this.doAction({ id: 'uzyj', item: el.dataset.item ?? '' });
      return;
    }
    if (name === 'give') {
      this.doAction({
        id: 'give',
        item: el.dataset.item ?? '',
        meta: el.dataset.meta ?? '',
        qty: Number(el.dataset.qty ?? 1),
      });
      return;
    }
    if (name === 'skill') {
      this.doAction({ id: 'skill', skill: el.dataset.skill ?? '' });
      return;
    }
    if (name === 'dialog-next') {
      if (this.dialog) this.dialog.line += 1;
      this.renderDialog();
      return;
    }
    if (name === 'dialog-btn') {
      this.onDialog(Number(el.dataset.i ?? 0));
    }
  }

  private onAct(el: HTMLElement): void {
    const id = el.dataset.id ?? '';
    if (el.dataset.on !== '1') {
      if (el.dataset.reason) this.ui.toast(el.dataset.reason);
      return;
    }
    if (!this.state) return;
    if (id === 'siej') {
      this.sheetKind = 'seeds';
      this.renderSheet();
      return;
    }
    if (id === 'buduj') {
      this.sheetKind = 'build';
      this.renderSheet();
      return;
    }
    if (id === 'rozmowa') {
      const npc = contextOf(this.state, this.role).npc;
      if (!npc) {
        this.ui.toast(t('toast.talk_none'));
        return;
      }
      this.openDialog(npc.id);
      return;
    }
    const view = listActions(this.state, this.role, Date.now()).find((a) => a.id === id);
    this.doAction({ id, item: view?.item });
  }

  private openDialog(npcId: string): void {
    if (!this.state) return;
    const view = previewDialog(this.state, this.role, npcId, Date.now());
    this.dialog = { npc: npcId, line: 0, lines: view.lines.slice(), buttons: view.buttons };
    this.sheetKind = 'dialog';
    this.doAction({ id: 'talk', npc: npcId });
    this.renderDialog();
  }

  private onDialog(index: number): void {
    const button = this.dialog?.buttons[index];
    if (!button) return;
    if (!button.action) {
      this.sheetKind = '';
      this.dialog = null;
      this.ui.closeSheet();
      return;
    }
    if (button.action.id === 'open_shop') {
      this.dialog = null;
      this.sheetKind = 'shop';
      this.renderSheet();
      return;
    }
    this.doAction(button.action);
    if (this.dialog && this.state) {
      const view = previewDialog(this.state, this.role, this.dialog.npc, Date.now());
      this.dialog.buttons = view.buttons;
      this.renderDialog();
    }
  }

  private pickRole(intent: Intent): void {
    this.intent = intent;
    this.phase = 'role';
    this.sheetKind = '';
    this.ui.showRoles(t('role.pick'));
  }

  private async copyCode(): Promise<void> {
    if (!this.code) return;
    try {
      await navigator.clipboard.writeText(this.code);
      this.ui.toast(t('toast.copy'));
    } catch {
      this.ui.toast(this.code);
    }
  }

  private async startHost(session: SessionInfo | null): Promise<void> {
    this.booting = true;
    this.host = true;
    this.guest = null;
    const resumed = this.intent === 'resume' ? session ?? readSession() : null;
    this.token = resumed?.token || uid('t');
    const now = Date.now();
    if (this.intent === 'continue' || (this.intent === 'resume' && readSave())) {
      const blob = readSave();
      if (!blob) {
        this.ui.toast(t('menu.noSave'));
        this.backMenu(false);
        return;
      }
      this.state = normalize(cloneState(blob.state));
      this.noticeCursor = this.state.noticeSeq;
      catchUp(this.state, now);
      this.savedAt = blob.savedAt;
    } else {
      this.state = createGame(now);
      this.noticeCursor = 0;
      this.savedAt = now;
    }
    this.state.connected = { ogrodnik: false, zielarka: false };
    this.state.connected[this.role] = true;
    let code = resumed?.code || makeCode();
    this.ui.showWait(t('lobby.connecting'));
    const net = new Net();
    this.attachNet(net);
    this.net = net;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await net.host(code);
        this.code = net.code;
        break;
      } catch (err) {
        const type = err instanceof Error ? err.message : '';
        if (type === 'unavailable-id' && attempt < 3) {
          this.ui.toast(t('toast.peer_retry'));
          await wait(800);
          code = makeCode();
          continue;
        }
        this.ui.toast(t('toast.net'));
        this.backMenu(false);
        return;
      }
    }
    this.booting = false;
    writeSession({ code: this.code, role: this.role, host: true, token: this.token, at: Date.now() });
    this.saveMaybe(Date.now(), true);
    this.phase = 'lobby';
    this.link = 'wait';
    this.lastHeard = Date.now();
    this.ui.showLobby(this.code, false);
  }

  private async startJoin(session: SessionInfo | null): Promise<void> {
    this.booting = true;
    this.host = false;
    const resumed = this.intent === 'resume' ? session ?? readSession() : null;
    this.token = resumed?.token || uid('g');
    const code = (resumed?.code || this.pendingCode).toUpperCase();
    if (code.length < 4) {
      this.ui.toast(t('join.need'));
      this.backMenu(false);
      return;
    }
    this.code = code;
    this.ui.showWait(t('lobby.looking', { code }));
    const net = new Net();
    this.attachNet(net);
    this.net = net;
    try {
      await net.join(code);
    } catch (err) {
      const type = err instanceof Error ? err.message : '';
      this.ui.toast(type === 'peer-unavailable' ? t('toast.no_room') : t('toast.net'));
      this.backMenu(false);
      return;
    }
    this.booting = false;
    const save = readSave();
    net.send({ t: 'hello', role: this.role, token: this.token, save });
    writeSession({ code, role: this.role, host: false, token: this.token, at: Date.now() });
    this.phase = 'wait';
    this.link = 'wait';
    this.lastHeard = Date.now();
  }

  private attachNet(net: Net): void {
    net.admit = (msg) => this.prepareHello(msg);
    net.onMessage = (msg) => this.onNet(msg);
    net.onConnected = () => {
      this.link = 'ok';
      this.lastHeard = Date.now();
    };
    net.onDisconnected = () => {
      this.link = 'off';
      if (this.host && this.guest && this.state) this.state.connected[this.guest.role] = false;
      if (this.phase === 'play' || this.phase === 'lobby') this.ui.toast(t('toast.disconnected'));
      if (this.phase === 'play' && this.state) {
        this.paintHud(Date.now());
        this.paintBanner(Date.now());
      }
    };
    net.onError = (type) => {
      if (this.booting) return;
      if (type === 'peer-unavailable') this.ui.toast(t('toast.no_room'));
      else if (type === 'network' || type === 'server-error' || type === 'socket-error') this.ui.toast(t('toast.net'));
    };
  }

  private prepareHello(msg: NetMsg): boolean {
    if (!this.state || !this.host) return false;
    const requested = msg.role === 'zielarka' ? 'zielarka' : msg.role === 'ogrodnik' ? 'ogrodnik' : null;
    const token = String(msg.token ?? '');
    if (!requested || !token) return false;
    const save = msg.save as SaveBlob | null;
    if (save && isState(save.state)) {
      const newer = save.rev > this.state.rev || (save.rev === this.state.rev && (save.savedAt ?? 0) > this.savedAt);
      if (newer) this.adopt(save, true);
    }
    if (!this.state) return false;
    const alive = (r: Role) => !!this.guest && this.guest.role === r && this.guest.token !== token && this.state!.connected[r];
    let assign: Role = requested;
    if (assign === this.role || alive(assign)) {
      const alt = otherRole(assign);
      if (alt !== this.role && !alive(alt)) assign = alt;
      else return false;
    }
    if (this.guest && this.guest.token !== token) this.state.connected[this.guest.role] = false;
    this.guest = { role: assign, token };
    this.swapped = assign !== requested;
    this.state.connected[this.role] = true;
    this.state.connected[assign] = true;
    return true;
  }

  private onNet(msg: NetMsg): void {
    if (msg.t === 'hello') {
      this.finishHello();
      return;
    }
    if (msg.t === 'reject') {
      this.ui.toast(t('toast.room_full'));
      this.backMenu(false);
      return;
    }
    if (msg.t === 'welcome') {
      this.takeWelcome(msg);
      return;
    }
    if (msg.t === 'state' && !this.host) {
      if (isState(msg.state)) this.takeRemote(msg.state as GameState);
      return;
    }
    if (msg.t === 'pos' && this.host) this.takePos(msg);
    if (msg.t === 'action' && this.host) this.takeRemoteAction(msg);
    if (msg.t === 'ping') {
      this.net?.send({ t: 'pong', ts: msg.ts });
      this.lastHeard = Date.now();
      this.link = 'ok';
    }
    if (msg.t === 'pong') {
      this.lastHeard = Date.now();
      this.link = 'ok';
    }
    if (msg.t === 'import' && this.host) {
      const save = msg.save as SaveBlob;
      if (save && isState(save.state)) this.adopt(save, false);
      this.broadcast(true);
    }
  }

  private finishHello(): void {
    if (!this.state || !this.guest || !this.net) return;
    this.link = 'ok';
    this.lastHeard = Date.now();
    this.net.send({ t: 'welcome', state: this.state, role: this.guest.role, swapped: this.swapped });
    this.ui.toast(t('toast.connected'));
    this.audio.play('join');
    if (this.phase === 'lobby') this.ui.showLobby(this.code, true);
    if (this.phase === 'play') {
      this.paintHud(Date.now());
      this.paintBanner(Date.now());
    }
    this.broadcast(true);
  }

  private takeWelcome(msg: NetMsg): void {
    if (!isState(msg.state)) return;
    this.state = takeNetState(msg.state as GameState);
    this.role = msg.role === 'zielarka' ? 'zielarka' : 'ogrodnik';
    this.noticeCursor = this.state.noticeSeq;
    this.host = false;
    if (msg.swapped) this.ui.toast(t('toast.role_swap', { name: t('role.' + this.role) }));
    else this.ui.toast(t('toast.connected'));
    this.audio.play('join');
    writeSession({ code: this.code, role: this.role, host: false, token: this.token, at: Date.now() });
    this.saveMaybe(Date.now(), true);
    this.enterPlay();
  }

  private takeRemote(raw: GameState): void {
    if (!this.state) {
      this.state = takeNetState(raw);
      return;
    }
    const next = takeNetState(raw);
    const local = this.state.characters[this.role];
    const mine = next.characters[this.role];
    const locked = mine.downed || mine.posLockUntil > Date.now();
    if (!locked && this.moving) {
      mine.x = local.x;
      mine.z = local.z;
      mine.rot = local.rot;
      mine.sitting = local.sitting;
      mine.anim = local.anim;
    }
    this.state = next;
    this.drain();
  }

  private takePos(msg: NetMsg): void {
    if (!this.state) return;
    const role: Role | null = msg.role === 'zielarka' ? 'zielarka' : msg.role === 'ogrodnik' ? 'ogrodnik' : null;
    if (!role || role === this.role) return;
    const ch = this.state.characters[role];
    const x = Number(msg.x);
    const z = Number(msg.z);
    const rot = Number(msg.rot);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (ch.downed || ch.posLockUntil > Date.now()) return;
    if (hypot(ch.x, ch.z, x, z) > 2.2) return;
    ch.x = x;
    ch.z = z;
    if (Number.isFinite(rot)) ch.rot = rot;
    if (typeof msg.sitting === 'boolean') ch.sitting = msg.sitting;
  }

  private takeRemoteAction(msg: NetMsg): void {
    if (!this.state) return;
    const role: Role | null = msg.role === 'zielarka' ? 'zielarka' : msg.role === 'ogrodnik' ? 'ogrodnik' : this.guest?.role ?? null;
    const raw = msg.a;
    if (!role || role === this.role || !raw || typeof raw !== 'object') return;
    const a = raw as ActionMsg;
    if (typeof a.id !== 'string' || a.id === 'open_shop') return;
    applyAction(this.state, role, a, Date.now());
    this.drain();
    this.broadcast(true);
  }

  private doAction(partial: Partial<ActionMsg> & { id: string }): void {
    if (!this.state || !partial.id) return;
    const ch = this.state.characters[this.role];
    const a: ActionMsg = { ...partial, id: partial.id, x: ch.x, z: ch.z, rot: ch.rot };
    if (this.host) {
      applyAction(this.state, this.role, a, Date.now());
      this.drain();
      this.broadcast(true);
    } else {
      this.net?.send({ t: 'action', role: this.role, a });
    }
  }

  private adopt(blob: SaveBlob, quiet: boolean): void {
    if (!isState(blob.state)) {
      this.ui.toast(t('toast.import_bad'));
      return;
    }
    this.state = normalize(cloneState(blob.state));
    catchUp(this.state, Date.now());
    this.state.connected = { ogrodnik: false, zielarka: false };
    this.state.connected[this.role] = true;
    if (this.guest) this.state.connected[this.guest.role] = true;
    this.savedAt = blob.savedAt || Date.now();
    this.noticeCursor = this.state.noticeSeq;
    this.saveMaybe(Date.now(), true);
    if (!quiet) {
      this.ui.toast(t('toast.imported'));
      this.broadcast(true);
    }
  }

  private async onFile(file: File): Promise<void> {
    const text = await file.text();
    const blob = parseImport(text);
    if (!blob) {
      this.ui.toast(t('toast.import_bad'));
      return;
    }
    if (this.host && this.state) this.adopt(blob, false);
    else if (this.net) this.net.send({ t: 'import', save: blob });
    else this.ui.toast(t('toast.import_bad'));
  }

  private enterPlay(): void {
    if (!this.state) return;
    this.phase = 'play';
    this.sheetKind = '';
    this.dialog = null;
    this.ui.showPlay();
    this.audio.unlock();
    this.paintHud(Date.now());
  }

  private backMenu(dropSession: boolean): void {
    this.saveMaybe(Date.now(), true);
    this.net?.destroy();
    this.net = null;
    this.state = null;
    this.guest = null;
    this.host = false;
    this.booting = false;
    this.dialog = null;
    this.sheetKind = '';
    this.link = 'wait';
    if (dropSession) clearSession();
    this.refreshMenu();
  }

  private broadcast(force: boolean): void {
    if (!this.host || !this.state || !this.net) return;
    const now = performance.now();
    if (!force && now - this.lastBroadcast < 150) return;
    this.lastBroadcast = now;
    this.net.send({ t: 'state', state: this.state });
  }

  private ping(now: number): void {
    if (!this.net?.conn || now - this.lastPing < 2000) return;
    this.lastPing = now;
    this.net.send({ t: 'ping', ts: now });
  }

  private saveMaybe(now: number, force = false): void {
    if (!this.state) return;
    if (!force && now - this.lastSave < 5000) return;
    if (!force && this.state.rev === this.savedRev) return;
    const blob = writeSave(this.state);
    this.lastSave = now;
    this.savedRev = this.state.rev;
    this.savedAt = blob.savedAt;
  }

  private drain(): void {
    if (!this.state) return;
    for (const n of this.state.notices) {
      if (n.id <= this.noticeCursor) continue;
      this.noticeCursor = Math.max(this.noticeCursor, n.id);
      if (n.role !== 'all' && n.role !== this.role) continue;
      if (n.msg) this.ui.toast(n.msg);
      if (n.sfx) this.audio.play(n.sfx);
      if (this.settings.vibration && (n.sfx === 'hurt' || n.sfx === 'hit')) navigator.vibrate?.(16);
    }
  }

  private paintHud(now: number): void {
    if (!this.state) return;
    const ch = this.state.characters[this.role];
    const partner = this.state.characters[otherRole(this.role)];
    const st = computeStats(this.state, this.role);
    const pst = computeStats(this.state, partner.role);
    const actions = listActions(this.state, this.role, now);
    const dock: DockButton[] = actions.map((a) => ({ id: a.id, label: a.label, enabled: a.enabled, reason: a.reason }));
    this.ui.setDock(dock, true);
    const partnerOn = !!this.state.connected[partner.role];
    const partnerNote = !partnerOn
      ? t('hud.offline')
      : partner.map !== ch.map
        ? t('map.' + partner.map)
        : t('hud.partner');
    this.ui.setHud({
      coins: this.state.coins,
      level: ch.level,
      hp: ch.hp,
      maxHp: st.maxHp,
      partnerHp: partner.hp,
      partnerMax: pst.maxHp,
      partnerNote,
      xp: Math.max(0, Math.min(1, ch.xp / Math.max(1, xpNeed(ch.level)))),
      water: this.role === 'zielarka' ? t('hud.water', { n: ch.water, max: st.waterMax }) : '',
      code: this.code,
      tracker: trackerLine(this.state),
      link: this.state.connected[partner.role] ? this.link : 'off',
      side: this.settings.joystickSide,
    });
  }

  private paintBanner(now: number): void {
    if (!this.state || this.phase !== 'play') {
      this.ui.setBanner('none', null);
      return;
    }
    const ch = this.state.characters[this.role];
    const invite = this.state.invite;
    if (invite && invite.from !== this.role && invite.until > now) {
      const html = `<p>${esc(t('invite.text', { name: t('role.' + invite.from), map: t('map.' + invite.map) }))}</p>
        <div class="row"><button class="btn" type="button" data-go="invite-yes">${esc(t('invite.yes'))}</button>
        <button class="btn alt" type="button" data-go="invite-no">${esc(t('invite.no'))}</button></div>`;
      this.ui.setBanner('invite:' + invite.map + invite.until, html);
      return;
    }
    const ctx = contextOf(this.state, this.role);
    if (ctx.exitTo && !ch.downed) {
      const html = `<p>${esc(t('map.exit', { name: t('map.' + ctx.exitTo) }))}</p>
        <div class="row"><button class="btn" type="button" data-go="exit-go" data-map="${ctx.exitTo}">${esc(t('map.enter'))}</button>
        <button class="btn alt" type="button" data-go="exit-call" data-map="${ctx.exitTo}">${esc(t('map.call'))}</button></div>`;
      this.ui.setBanner('exit:' + ctx.exitTo, html);
      return;
    }
    if (this.link !== 'ok' && (this.guest || !this.host)) {
      this.ui.setBanner('link', `<p>${esc(t('banner.offline'))}</p>`);
      return;
    }
    this.ui.setBanner('none', null);
  }

  private renderSheet(): void {
    if (!this.state) return;
    if (this.sheetKind === 'inv') this.ui.showInv(this.invHtml());
    else if (this.sheetKind === 'char') this.ui.showChar(this.charHtml());
    else if (this.sheetKind === 'quests') this.ui.showQuests(this.questHtml());
    else if (this.sheetKind === 'map') this.ui.showMap(this.mapHtml());
    else if (this.sheetKind === 'shop') this.ui.showShop(this.shopHtml());
    else if (this.sheetKind === 'seeds') this.ui.showSeeds(this.seedHtml());
    else if (this.sheetKind === 'build') this.ui.showBuild(this.buildHtml());
    else if (this.sheetKind === 'dialog') this.renderDialog();
  }

  private renderDialog(): void {
    if (!this.dialog) return;
    const d = this.dialog;
    const line = d.lines[Math.min(d.line, d.lines.length - 1)] ?? '';
    const more = d.line < d.lines.length - 1;
    const buttons = more
      ? `<button class="btn" type="button" data-go="dialog-next">${esc(t('dlg.next'))}</button>`
      : d.buttons.map((b, i) => `<button class="btn alt" type="button" data-go="dialog-btn" data-i="${i}">${esc(b.label)}</button>`).join('');
    this.ui.showDialog(`
      <h2>${esc(d.lines.length ? t('npc.' + d.npc + '.name') : '')}</h2>
      <p class="hint">${esc(t('npc.' + d.npc + '.title'))}</p>
      <p class="pre">${esc(line)}</p>
      ${buttons}
    `);
    this.sheetKind = 'dialog';
  }

  private invHtml(): string {
    if (!this.state) return '';
    const ch = this.state.characters[this.role];
    const slots: EquipSlot[] = ['hat', 'gloves', 'boots', 'tool'];
    const slotLabel: Record<EquipSlot, string> = {
      hat: t('inv.hat'), gloves: t('inv.gloves'), boots: t('inv.boots'), tool: t('inv.tool'),
    };
    const equipped = slots.map((slot) => {
      const id = ch.equip[slot];
      return `<div class="card"><b>${esc(slotLabel[slot])}</b><p>${esc(id ? itemName(id) : '—')}</p>
        ${id ? `<button class="btn tiny alt" type="button" data-go="unequip" data-slot="${slot}">${esc(t('inv.unequip'))}</button>` : ''}</div>`;
    }).join('');
    const items = ch.inv.length
      ? ch.inv.map((st, i) => `<button class="btn tiny ${i === this.invIdx ? '' : 'alt'}" type="button" data-go="pick" data-idx="${i}">${esc(itemName(st.id, st.meta))} ×${st.n}</button>`).join('')
      : `<p class="hint">${esc(t('inv.empty'))}</p>`;
    const sel = ch.inv[this.invIdx];
    let detail = `<p class="hint">${esc(t('inv.desc'))}</p>`;
    if (sel) {
      const def = ITEMS[sel.id];
      const meta = sel.meta ?? '';
      const equip = def?.slot ? `<button class="btn tiny" type="button" data-go="equip" data-item="${esc(sel.id)}">${esc(t('inv.equip'))}</button>` : '';
      const use = def?.kind === 'consumable' ? `<button class="btn tiny" type="button" data-go="use" data-item="${esc(sel.id)}">${esc(t('inv.use'))}</button>` : '';
      detail = `<div class="card"><b>${esc(itemName(sel.id, sel.meta))}</b><p>${esc(def?.desc ?? '')}</p>
        <div class="row">${equip}${use}
        <button class="btn tiny alt" type="button" data-go="give" data-item="${esc(sel.id)}" data-meta="${esc(meta)}" data-qty="1">${esc(t('inv.give1'))}</button>
        <button class="btn tiny alt" type="button" data-go="give" data-item="${esc(sel.id)}" data-meta="${esc(meta)}" data-qty="${sel.n}">${esc(t('inv.giveAll'))}</button>
        </div></div>`;
    }
    return `<h2>${esc(t('inv.title'))}</h2><div class="grid">${equipped}</div><div class="list">${items}</div>${detail}
      <button class="btn" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private charHtml(): string {
    if (!this.state) return '';
    const ch = this.state.characters[this.role];
    const st = computeStats(this.state, this.role);
    const rows: [string, string][] = [
      ['stat.maxHp', String(Math.round(st.maxHp))],
      ['stat.attack', String(Math.round(st.attack))],
      ['stat.defense', String(Math.round(st.defense))],
      ['stat.speed', st.speed.toFixed(2)],
      ['stat.waterMax', String(Math.round(st.waterMax))],
    ];
    const skills = SKILLS.filter((sk) => sk.role === this.role).map((sk) => {
      const owned = ch.skills.includes(sk.id);
      const ready = !owned && ch.skillPoints > 0 && ch.level >= sk.needLevel && sk.requires.every((r) => ch.skills.includes(r));
      const note = owned ? t('char.owned') : ch.level < sk.needLevel ? t('char.needLvl', { n: sk.needLevel }) : t('char.locked');
      return `<div class="card"><b>${esc(t('skill.' + sk.id + '.name'))}</b><p>${esc(t('skill.' + sk.id + '.desc'))}</p>
        ${ready ? `<button class="btn tiny" type="button" data-go="skill" data-skill="${sk.id}">${esc(t('char.unlock'))}</button>` : `<p class="mark">${esc(note)}</p>`}</div>`;
    }).join('');
    return `<h2>${esc(t('char.title'))}</h2>
      <p>${esc(t('role.' + this.role))} · ${esc(t('hud.lvl', { n: ch.level }))}</p>
      <p>${esc(t('char.xp'))}: ${ch.xp}/${xpNeed(ch.level)}</p>
      <p>${esc(t('char.points', { n: ch.skillPoints }))}</p>
      <h3>${esc(t('char.stats'))}</h3>
      ${rows.map(([k, v]) => `<div class="stat"><span>${esc(t(k))}</span><b>${v}</b></div>`).join('')}
      <div class="list">${skills}</div>
      <button class="btn" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private questHtml(): string {
    if (!this.state) return '';
    const groups = ['active', 'available', 'done'] as const;
    const titles = { active: t('quest.main'), available: t('quest.avail'), done: t('quest.done') };
    const blocks = groups.map((status) => {
      const list = this.state!.quests.filter((q) => q.status === status);
      if (!list.length) return '';
      const cards = list.map((q) => {
        const def = questDef(q.id);
        const objs = q.status === 'active'
          ? def.objectives.map((_, i) => {
            const line = objectiveLine(this.state!, q, i);
            return `<p>${line.done ? '✓' : '•'} ${esc(line.text)}</p>`;
          }).join('')
          : `<p>${esc(t('quest.' + q.id + '.desc'))}</p>`;
        const badge = def.coop ? `<span class="mark">${esc(t('quest.coop'))}</span>` : '';
        const ready = q.status === 'active' && isReady(this.state!, q) ? `<p class="mark">${esc(t('quest.turn'))}</p>` : '';
        return `<div class="card ${status === 'done' ? 'done' : ''}"><b>${esc(t('quest.' + q.id + '.title'))}</b> ${badge}${objs}${ready}</div>`;
      }).join('');
      return `<h3>${esc(titles[status])}</h3><div class="list">${cards}</div>`;
    }).join('');
    const empty = this.state.quests.length ? '' : `<p class="hint">${esc(t('quest.empty'))}</p>`;
    return `<h2>${esc(t('quest.title'))}</h2>${empty}${blocks}
      <button class="btn" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private mapHtml(): string {
    if (!this.state) return '';
    const here = this.state.characters[this.role].map;
    const cards = MAP_ORDER.map((id) => {
      if (id === here) {
        return `<div class="card"><b>${esc(t('map.' + id))}</b><p class="mark">${esc(t('map.you'))}</p></div>`;
      }
      return `<div class="card"><b>${esc(t('map.' + id))}</b><div class="row">
        <button class="btn tiny" type="button" data-go="travel" data-map="${id}" data-call="0">${esc(t('map.go'))}</button>
        <button class="btn tiny alt" type="button" data-go="travel" data-map="${id}" data-call="1">${esc(t('map.call'))}</button>
      </div></div>`;
    }).join('');
    return `<h2>${esc(t('map.title'))}</h2><div class="list">${cards}</div>
      <button class="btn" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private shopHtml(): string {
    if (!this.state) return '';
    const tabs = (['buy', 'sell', 'orders'] as const).map((tab) => {
      const label = tab === 'buy' ? t('shop.buy') : tab === 'sell' ? t('shop.sell') : t('shop.orders');
      return `<button class="btn tiny ${this.shopTab === tab ? '' : 'alt'}" type="button" data-go="tab" data-tab="${tab}">${esc(label)}</button>`;
    }).join('');
    let body = '';
    if (this.shopTab === 'buy') {
      const items = Object.values(ITEMS).filter((it) => shopVisible(this.state!, it.id));
      body = items.length ? items.map((it) => `<div class="card"><b>${esc(itemName(it.id))}</b><p>${esc(it.desc)}</p>
        <button class="btn tiny" type="button" data-go="buy" data-item="${esc(it.id)}">${esc(t('shop.buy'))} · ${it.buy}</button></div>`).join('')
        : `<p class="hint">${esc(t('shop.none'))}</p>`;
    } else if (this.shopTab === 'sell') {
      const stacks = this.state.characters[this.role].inv.filter((st) => (ITEMS[st.id]?.sell ?? 0) > 0);
      body = stacks.length ? stacks.map((st) => {
        const sell = ITEMS[st.id]?.sell ?? 0;
        return `<div class="card"><b>${esc(itemName(st.id, st.meta))} ×${st.n}</b>
          <button class="btn tiny" type="button" data-go="sell" data-item="${esc(st.id)}" data-meta="${esc(st.meta ?? '')}">${esc(t('shop.sell'))} · ${sell}</button></div>`;
      }).join('') : `<p class="hint">${esc(t('shop.noSell'))}</p>`;
    } else {
      const rows = orderRows(this.state);
      body = rows.map((o) => `<div class="card"><b>${esc(o.title)}</b><p>${esc(o.desc)}</p><p>${esc(o.have)}</p>
        <button class="btn tiny ${o.ok ? '' : 'off'}" type="button" data-go="order" data-order="${esc(o.id)}">${esc(t('shop.deliver'))} · ${o.coins}</button></div>`).join('');
    }
    return `<h2>${esc(t('shop.title'))}</h2><p class="coins">${esc(t('shop.coins', { n: this.state.coins }))}</p>
      <div class="tabs">${tabs}</div><div class="list">${body}</div>
      <button class="btn" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private seedHtml(): string {
    if (!this.state) return '';
    const seeds = seedChoices(this.state, this.role);
    const body = seeds.length
      ? seeds.map((s) => `<button class="btn alt" type="button" data-go="seed" data-species="${esc(s.id)}">${esc(s.name)} ×${s.n}</button>`).join('')
      : `<p class="hint">${esc(t('seed.empty'))}</p>`;
    return `<h2>${esc(t('seed.title'))}</h2><div class="list">${body}</div>
      <button class="btn soft" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }

  private buildHtml(): string {
    if (!this.state) return '';
    const body = BUILDS.map((b) => `<div class="card"><b>${esc(t('build.' + b.id + '.name'))}</b><p>${esc(t('build.' + b.id + '.desc'))}</p>
      <button class="btn tiny" type="button" data-go="build" data-build="${b.id}">${esc(t('build.place'))} · ${esc(t('build.cost', { n: b.cost }))}</button></div>`).join('');
    return `<h2>${esc(t('build.title'))}</h2><p class="coins">${esc(t('shop.coins', { n: this.state.coins }))}</p>
      <div class="list">${body}</div>
      <button class="btn soft" type="button" data-go="resume-play">${esc(t('settings.back'))}</button>`;
  }
}

new App();
