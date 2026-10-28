import type { GameState, Role } from './types.ts';
import type { JoySide } from './settings.ts';

const STORE = 'piotrogrod-tutorial';

export const TUT = {
  dig: 'tut_dig',
  sow: 'tut_sow',
  prune: 'tut_prune',
  pest: 'tut_pest',
  fill: 'tut_fill',
  water: 'tut_water',
  fert: 'tut_fert',
  heal: 'tut_heal',
  cross: 'tut_cross',
  harvest: 'tut_harvest',
  quest: 'tut_quest',
  level: 'tut_level',
  coop: 'tut_coop',
  travel: 'tut_travel_',
} as const;

type Done =
  | { kind: 'move' }
  | { kind: 'flag'; flag: string }
  | { kind: 'sheet'; sheet: string }
  | { kind: 'coins' }
  | { kind: 'hp' }
  | { kind: 'coop' }
  | { kind: 'travel' };

interface Step {
  id: string;
  say: string;
  ask?: string;
  prep?: string;
  dock?: string;
  done: Done;
}

const OGRODNIK: Step[] = [
  { id: 'move', say: 'Chwyć lewą stronę i przeciągnij kciuk. Tak chodzicie po ogrodzie.', done: { kind: 'move' } },
  { id: 'dig', say: 'Stań na brązowej grządce i stuknij Kop.', dock: 'kop', done: { kind: 'flag', flag: TUT.dig } },
  { id: 'sow', say: 'Grządka skopana. Stuknij Siej i wybierz nasiono.', dock: 'siej', done: { kind: 'flag', flag: TUT.sow } },
  { id: 'prune', say: 'Ten krzaczek prosi o cięcie. Stań przy nim i stuknij Tnij.', prep: 'prune', dock: 'przytnij', done: { kind: 'flag', flag: TUT.prune } },
  { id: 'pest', say: 'Ślimak na grządce. Stań przodem i stuknij Goń.', prep: 'pest', dock: 'gon', done: { kind: 'flag', flag: TUT.pest } },
  { id: 'inv', say: 'Otwórz menu i wejdź w Ekwipunek. Tam trzymacie nasiona i plastry.', done: { kind: 'sheet', sheet: 'inv' } },
];

const ZIELARKA: Step[] = [
  { id: 'move', say: 'Chwyć lewą stronę i przeciągnij kciuk. Tak chodzicie po ogrodzie.', done: { kind: 'move' } },
  { id: 'fill', say: 'Konewka pusta. Podejdź do studni i stuknij Napełnij.', prep: 'fill', dock: 'napelnij', done: { kind: 'flag', flag: TUT.fill } },
  { id: 'water', say: 'Roślina jest spragniona. Stań przy niej i stuknij Podlej.', prep: 'water', dock: 'podlej', done: { kind: 'flag', flag: TUT.water } },
  { id: 'fert', say: 'Sypnij kompost pod roślinę. Stuknij Nawóź.', prep: 'fert', dock: 'nawoz', done: { kind: 'flag', flag: TUT.fert } },
  {
    id: 'heal',
    say: 'Partner oberwał. Stań obok, otwórz ekwipunek i użyj bandaża.',
    ask: 'Poproś partnera, żeby stał obok.',
    prep: 'heal',
    done: { kind: 'flag', flag: TUT.heal },
  },
  { id: 'cross', say: 'Dwie dojrzałe stokrotki obok siebie. Stań między nimi i stuknij Krzyżuj.', prep: 'cross', dock: 'krzyzuj', done: { kind: 'flag', flag: TUT.cross } },
];

const SHARED: Step[] = [
  { id: 'coop', say: 'Podejdź do drugiej postaci. Jedno kopie, drugie podlewa — sami ogrodu nie dowieziecie.', done: { kind: 'coop' } },
  {
    id: 'harvest',
    say: 'Zerwijcie pierwszy plon. Ogrodnik stuka Zbierz, Zielarka może zebrać ziele.',
    ask: 'Poproś partnera o zbiór, jeśli sam nie sięgasz.',
    prep: 'harvest',
    dock: 'zbierz',
    done: { kind: 'flag', flag: TUT.harvest },
  },
  { id: 'chest', say: 'Monety na górze są wspólne. To wasza skrzynia. Stuknij je.', done: { kind: 'coins' } },
  { id: 'questlog', say: 'Otwórz menu i Zadania. Wójt już coś dla was ma.', done: { kind: 'sheet', sheet: 'quests' } },
  { id: 'skills', say: 'Awans! Otwórz menu i Postać — tam są umiejętności.', prep: 'skills', done: { kind: 'sheet', sheet: 'char' } },
  { id: 'travel', say: 'Wyjdź z mapy ścieżką na brzegu. Wieś, las, łąka i jaskinia są obok.', done: { kind: 'travel' } },
  {
    id: 'quest',
    say: 'To ja, Stanisław. Podejdź na rynku i stuknij Rozmowa. Dostaniecie pierwsze zadanie.',
    ask: 'Poproś partnera, żeby podszedł do wójta, jeśli ty jesteś daleko.',
    dock: 'rozmowa',
    done: { kind: 'flag', flag: TUT.quest },
  },
  { id: 'danger', say: 'Czerwony pasek to ty, niebieski to partner. Las, woda i burza bolą. Stuknij paski.', done: { kind: 'hp' } },
];

export function stepsFor(role: Role): Step[] {
  return [...(role === 'ogrodnik' ? OGRODNIK : ZIELARKA), ...SHARED];
}

type Save = Partial<Record<Role, boolean>>;

function readStore(): Save {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Save;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function tutorialDone(role: Role): boolean {
  return !!readStore()[role];
}

export function setTutorialDone(role: Role): void {
  const all = readStore();
  all[role] = true;
  localStorage.setItem(STORE, JSON.stringify(all));
}

export function clearTutorial(role?: Role): void {
  if (!role) {
    localStorage.removeItem(STORE);
    return;
  }
  const all = readStore();
  delete all[role];
  localStorage.setItem(STORE, JSON.stringify(all));
}

export interface TutorModel {
  say: string;
  ask: string;
  step: string;
  n: number;
  total: number;
}

export interface TutorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TutorHooks {
  act: (id: string, meta?: string) => void;
  sfx: (name: string) => void;
  close: () => void;
  show: (model: TutorModel | null) => void;
  place: (ring: TutorBox | null, bubble: { left: number; top: number }) => void;
}

export class Tutorial {
  private steps: Step[] = [];
  private index = 0;
  private on = false;
  private role: Role = 'ogrodnik';
  private base: Record<string, number> = {};
  private origin = { x: 0, z: 0, hp: 0 };
  private hpTap = false;
  private coinTap = false;
  private prepped = '';
  private flagged = '';
  private sig = '';

  private hooks: TutorHooks;

  constructor(hooks: TutorHooks) {
    this.hooks = hooks;
  }

  get active(): boolean {
    return this.on;
  }

  currentId(): string {
    return this.on ? (this.steps[this.index]?.id ?? 'done') : '';
  }

  begin(role: Role, state: GameState): void {
    if (tutorialDone(role)) {
      this.stop(false);
      return;
    }
    this.role = role;
    this.steps = stepsFor(role);
    this.index = 0;
    this.on = true;
    this.prepped = '';
    this.snap(state);
    this.sig = '';
    this.push('', 'lewa');
  }

  skip(): void {
    if (!this.on) return;
    setTutorialDone(this.role);
    this.stop(false);
  }

  pokeHp(): void {
    this.hpTap = true;
  }

  pokeCoins(): void {
    this.coinTap = true;
  }

  stop(done: boolean): void {
    if (done && this.on) setTutorialDone(this.role);
    this.on = false;
    this.sig = '';
    this.hooks.show(null);
  }

  update(state: GameState, role: Role, sheet: string, side: JoySide): void {
    if (!this.on || role !== this.role) return;
    const step = this.steps[this.index];
    if (!step) {
      this.hooks.sfx('questdone');
      this.stop(true);
      return;
    }
    if (step.prep && this.prepped !== step.id) {
      this.prepped = step.id;
      this.hooks.act('tut_prep', step.id);
    }
    if (step.done.kind === 'coop' && this.nearPartner(state) && this.flagged !== step.id) {
      this.flagged = step.id;
      this.hooks.act('tut_flag', TUT.coop);
    }
    if (this.finished(step, state, sheet)) {
      this.hooks.sfx(this.index + 1 >= this.steps.length ? 'questdone' : 'quest');
      this.hooks.close();
      this.index += 1;
      this.snap(state);
      if (this.index >= this.steps.length) {
        this.stop(true);
        return;
      }
    }
    this.push(sheet, side);
  }

  private snap(state: GameState): void {
    this.base = { ...state.flags };
    const ch = state.characters[this.role];
    this.origin = { x: ch.x, z: ch.z, hp: ch.hp };
    this.hpTap = false;
    this.coinTap = false;
    this.flagged = '';
  }

  private finished(step: Step, state: GameState, sheet: string): boolean {
    const ch = state.characters[this.role];
    const flag = (key: string) => (state.flags[key] ?? 0) > (this.base[key] ?? 0);
    switch (step.done.kind) {
      case 'move':
        return Math.hypot(ch.x - this.origin.x, ch.z - this.origin.z) > 1.05;
      case 'flag':
        return flag(step.done.flag);
      case 'sheet':
        if (step.id === 'skills' && ch.level < 2 && !flag(TUT.level)) return false;
        return sheet === step.done.sheet;
      case 'coins':
        return this.coinTap;
      case 'hp':
        return this.hpTap || ch.hp + 0.5 < this.origin.hp;
      case 'coop':
        return this.nearPartner(state) || flag(TUT.coop);
      case 'travel':
        return flag(TUT.travel + this.role);
      default:
        return false;
    }
  }

  private nearPartner(state: GameState): boolean {
    const a = state.characters[this.role];
    const b = state.characters[this.role === 'ogrodnik' ? 'zielarka' : 'ogrodnik'];
    return a.map === b.map && Math.hypot(a.x - b.x, a.z - b.z) < 1.75;
  }

  private push(sheet: string, side: JoySide): void {
    const step = this.steps[this.index];
    if (!step) return;
    const say = step.id === 'move' && side === 'prawa' ? step.say.replace('lewą', 'prawą') : step.say;
    const model: TutorModel = {
      say,
      ask: step.ask ?? '',
      step: step.id,
      n: this.index + 1,
      total: this.steps.length,
    };
    const sig = `${model.step}|${model.say}|${model.ask}|${model.n}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.hooks.show(model);
      const el = this.targetEl(step, sheet);
      const sheetEl = el?.closest('.sheet');
      if (el && sheetEl) {
        const top = el.offsetTop - sheetEl.clientHeight + el.offsetHeight + 24;
        sheetEl.scrollTop = Math.max(0, top);
      }
    }
    const rect = this.targetBox(step, sheet, side);
    const bubble = placeBubble(rect, side);
    this.hooks.place(rect, bubble);
  }

  private targetEl(step: Step, sheet: string): HTMLElement | null {
    if (step.id === 'sow' && sheet === 'seeds') return document.querySelector<HTMLElement>('[data-go="seed"]');
    if (step.id === 'heal') {
      const use = document.querySelector<HTMLElement>('[data-go="use"][data-item="bandaz"]');
      if (use) return use;
      const pick = document.querySelector<HTMLElement>('[data-go="pick"][data-item="bandaz"]');
      if (pick) return pick;
      if (sheet === 'pause') return document.querySelector<HTMLElement>('[data-go="inv"]');
      return document.querySelector<HTMLElement>('[data-go="pause"]');
    }
    if (step.done.kind === 'sheet') {
      if (sheet === 'pause') {
        const id = step.done.sheet === 'inv' ? 'inv' : step.done.sheet === 'char' ? 'char' : 'quests';
        return document.querySelector<HTMLElement>(`[data-go="${id}"]`);
      }
      if (sheet !== step.done.sheet) return document.querySelector<HTMLElement>('[data-go="pause"]');
    }
    if (step.dock && sheet !== 'pause' && sheet !== 'seeds' && sheet !== 'inv') {
      return document.querySelector<HTMLElement>(`[data-id="${step.dock}"]`);
    }
    if (step.done.kind === 'coins') return document.querySelector<HTMLElement>('#hud-coins');
    if (step.done.kind === 'hp') return document.querySelector<HTMLElement>('#hud-hp');
    if (step.done.kind === 'travel') return document.querySelector<HTMLElement>('[data-go="exit-go"]');
    if (step.id === 'skills') return document.querySelector<HTMLElement>('#hud-lvl');
    return null;
  }

  private targetBox(step: Step, sheet: string, side: JoySide): TutorBox | null {
    if (step.done.kind === 'move' || step.done.kind === 'coop') {
      const size = 104;
      const left = side === 'lewa' ? 18 : window.innerWidth - size - 18;
      return { left, top: Math.round(window.innerHeight * 0.62), width: size, height: size };
    }
    const el = this.targetEl(step, sheet);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 };
  }
}

function placeBubble(rect: TutorBox | null, side: JoySide): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(280, vw - 108);
  const height = 176;
  let left = Math.max(12, (vw - width) / 2);
  if (side === 'lewa') left = Math.min(left, vw - width - 76);
  else left = Math.max(left, 76);
  let top = Math.round(vh * 0.22);
  if (rect) {
    const inHud = rect.top + rect.height < 170;
    if (inHud) top = 172;
    else if (rect.top > vh * 0.45) top = Math.max(86, rect.top - height - 14);
    const overlaps = left < rect.left + rect.width && left + width > rect.left && top < rect.top + rect.height && top + height > rect.top;
    if (overlaps) {
      top = Math.max(86, Math.min(top, rect.top - height - 10));
      if (top + height > rect.top && top < rect.top + rect.height) {
        left = rect.left > vw * 0.5 ? Math.max(12, rect.left - width - 12) : Math.min(vw - width - 12, rect.left + rect.width + 12);
      }
    }
  }
  if (top + height > vh * 0.7) top = Math.round(vh * 0.18);
  return { left: Math.round(left), top: Math.round(Math.max(78, top)) };
}

export function travelKey(role: Role): string {
  return TUT.travel + role;
}
