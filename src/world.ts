import { normalize } from './logic.ts';
import type { GameState, Plant, Role, Stack } from './types.ts';
import { ROLES } from './types.ts';

const INDEX = 'piotrogrod-world-index';
const PREFIX = 'piotrogrod-world:';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CoinOp { id: string; delta: number }
export interface ItemOp { id: string; role: Role; item: string; meta: string; delta: number }

export interface WorldDoc {
  v: 1;
  code: string;
  name: string;
  role: Role;
  coinBase: number;
  coinOps: CoinOp[];
  itemBase: Record<Role, Stack[]>;
  itemOps: ItemOp[];
  plantU: Record<string, number>;
  plantGone: Record<string, number>;
  soilU: Record<string, number>;
  charU: Record<Role, number>;
  posU: Record<Role, number>;
  questU: Record<string, number>;
  buildU: Record<string, number>;
  fenceU: Record<string, number>;
  decorU: Record<string, number>;
  mobU: Record<string, number>;
  nodeU: Record<string, number>;
  state: GameState;
  savedAt: number;
  /** First join, before any meetup. Untouched starter rows must not overwrite the real garden. */
  provisional?: boolean;
}

export interface WorldCard { code: string; name: string; role: Role }

export function worldPeerId(code: string, role: Role): string {
  return `piotrogrod-w-${code.toUpperCase()}-${role}`;
}

function zeroRec(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(rec)) out[key] = 0;
  return out;
}

/** A phone that only knows the code. Real rows arrive at the first meetup. */
export function createJoinDoc(name: string, code: string, role: Role, state: GameState): WorldDoc {
  const doc = createWorldDoc(name, code, role, state);
  doc.provisional = true;
  doc.savedAt = 0;
  doc.plantU = zeroRec(doc.plantU);
  doc.plantGone = zeroRec(doc.plantGone);
  doc.soilU = zeroRec(doc.soilU);
  doc.questU = zeroRec(doc.questU);
  doc.buildU = zeroRec(doc.buildU);
  doc.fenceU = zeroRec(doc.fenceU);
  doc.decorU = zeroRec(doc.decorU);
  doc.mobU = zeroRec(doc.mobU);
  doc.nodeU = zeroRec(doc.nodeU);
  doc.charU = { ogrodnik: 0, zielarka: 0 };
  doc.posU = { ogrodnik: 0, zielarka: 0 };
  return doc;
}

export function makeWorldCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function stacksOf(state: GameState, role: Role): Stack[] {
  return state.characters[role].inv.map((st) => ({ id: st.id, n: st.n, meta: st.meta }));
}

export function createWorldDoc(name: string, code: string, role: Role, state: GameState): WorldDoc {
  const base = normalize(clone(state));
  const now = Date.now();
  const plantU: Record<string, number> = {};
  for (const p of base.plants) plantU[p.id] = now;
  const soilU: Record<string, number> = {};
  for (const key of Object.keys(base.soil)) soilU[key] = now;
  const questU: Record<string, number> = {};
  for (const q of base.quests) questU[q.id] = now;
  const mobU: Record<string, number> = {};
  for (const m of base.mobs) mobU[m.id] = now;
  const nodeU: Record<string, number> = {};
  for (const n of base.nodes) nodeU[n.key] = now;
  return {
    v: 1,
    code,
    name,
    role,
    coinBase: base.coins,
    coinOps: [],
    itemBase: { ogrodnik: stacksOf(base, 'ogrodnik'), zielarka: stacksOf(base, 'zielarka') },
    itemOps: [],
    plantU,
    plantGone: {},
    soilU,
    charU: { ogrodnik: now, zielarka: now },
    posU: { ogrodnik: now, zielarka: now },
    questU,
    buildU: { well: now, greenhouse: now, coop: now, house: now },
    fenceU: {},
    decorU: {},
    mobU,
    nodeU,
    state: base,
    savedAt: now,
  };
}

function opId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function invMap(list: Stack[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const st of list) {
    const k = `${st.id}|${st.meta ?? ''}`;
    m.set(k, (m.get(k) ?? 0) + st.n);
  }
  return m;
}

function diffInv(role: Role, before: Stack[], after: Stack[], into: ItemOp[]): void {
  const a = invMap(before);
  const b = invMap(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const delta = (b.get(key) ?? 0) - (a.get(key) ?? 0);
    if (!delta) continue;
    const [item, meta] = key.split('|');
    into.push({ id: opId(), role, item, meta, delta });
  }
}

/** A thirsty plant marked sick by the clock is not a newer edit than a watering. */
function wiltOnly(old: Plant, next: Plant): boolean {
  if (!(old.needsWater && next.needsWater && !old.needsHeal && next.needsHeal)) return false;
  const rest = (p: Plant): string => JSON.stringify({
    ...p,
    needsHeal: false,
    readyAt: null,
    since: 0,
  });
  return rest(old) === rest(next);
}

function bodySig(state: GameState, role: Role): string {
  const ch = state.characters[role];
  return JSON.stringify({
    xp: ch.xp, level: ch.level, skillPoints: ch.skillPoints, skills: ch.skills,
    hp: ch.hp, water: ch.water, equip: ch.equip,
  });
}

function posSig(state: GameState, role: Role): string {
  const ch = state.characters[role];
  return `${ch.map}:${Math.round(ch.x * 20)}:${Math.round(ch.z * 20)}`;
}

export function commitWorld(doc: WorldDoc, state: GameState, localRole: Role): WorldDoc {
  const now = Date.now();
  const prev = doc.state;
  const connected = {
    ogrodnik: !!state.connected?.ogrodnik,
    zielarka: !!state.connected?.zielarka,
  };
  const next = normalize(clone(state));
  next.connected = connected;
  if (next.coins !== prev.coins) doc.coinOps.push({ id: opId(), delta: next.coins - prev.coins });
  for (const role of ROLES) {
    diffInv(role, prev.characters[role].inv, next.characters[role].inv, doc.itemOps);
    if (bodySig(prev, role) !== bodySig(next, role)) doc.charU[role] = now;
    if (role === localRole && posSig(prev, role) !== posSig(next, role)) doc.posU[role] = now;
    if (role !== localRole) {
      const ch = next.characters[role];
      const old = prev.characters[role];
      ch.map = old.map;
      ch.x = old.x;
      ch.z = old.z;
      ch.rot = old.rot;
      ch.anim = old.anim;
      ch.sitting = old.sitting;
    }
  }
  const seen = new Set<string>();
  for (const p of next.plants) {
    seen.add(p.id);
    const old = prev.plants.find((x) => x.id === p.id);
    if (!old || (JSON.stringify(old) !== JSON.stringify(p) && !wiltOnly(old, p))) doc.plantU[p.id] = now;
  }
  for (const p of prev.plants) {
    if (!seen.has(p.id)) doc.plantGone[p.id] = now;
  }
  const soilKeys = new Set([...Object.keys(prev.soil), ...Object.keys(next.soil)]);
  for (const key of soilKeys) {
    if (JSON.stringify(prev.soil[key] ?? null) !== JSON.stringify(next.soil[key] ?? null)) doc.soilU[key] = now;
  }
  for (const q of next.quests) {
    const old = prev.quests.find((x) => x.id === q.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(q)) doc.questU[q.id] = now;
  }
  for (const key of ['well', 'greenhouse', 'coop', 'house'] as const) {
    if (prev.buildings[key] !== next.buildings[key]) doc.buildU[key] = now;
  }
  for (const f of next.fences) doc.fenceU[`${f.c},${f.r}`] = doc.fenceU[`${f.c},${f.r}`] ?? now;
  for (const d of next.decors) {
    const k = `${d.id}:${d.c},${d.r}`;
    if (!prev.decors.some((x) => x.id === d.id && x.c === d.c && x.r === d.r)) doc.decorU[k] = now;
  }
  for (const m of next.mobs) {
    const old = prev.mobs.find((x) => x.id === m.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(m)) doc.mobU[m.id] = now;
  }
  for (const n of next.nodes) {
    const old = prev.nodes.find((x) => x.key === n.key);
    if (!old || JSON.stringify(old) !== JSON.stringify(n)) doc.nodeU[n.key] = now;
  }
  next.coins = doc.coinBase + doc.coinOps.reduce((sum, op) => sum + op.delta, 0);
  for (const role of ROLES) next.characters[role].inv = foldItems(doc, role);
  doc.state = next;
  doc.savedAt = now;
  doc.role = localRole;
  return doc;
}

function foldItems(doc: WorldDoc, role: Role): Stack[] {
  const map = invMap(doc.itemBase[role] ?? []);
  for (const op of doc.itemOps) {
    if (op.role !== role) continue;
    const key = `${op.item}|${op.meta}`;
    map.set(key, (map.get(key) ?? 0) + op.delta);
  }
  const out: Stack[] = [];
  for (const [key, n] of map) {
    if (n <= 0) continue;
    const [id, meta] = key.split('|');
    const st: Stack = { id, n };
    if (meta) st.meta = meta;
    out.push(st);
  }
  return out;
}

function unionOps<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const op of a) map.set(op.id, op);
  for (const op of b) if (!map.has(op.id)) map.set(op.id, op);
  return [...map.values()];
}

function maxRec(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

export function mergeWorld(a: WorldDoc, b: WorldDoc): WorldDoc {
  const newer = a.savedAt >= b.savedAt ? a : b;
  const older = newer === a ? b : a;
  const generic = 'Świat ' + (a.code || b.code);
  const name = a.name !== generic ? a.name : b.name;
  const coinOps = unionOps(a.coinOps, b.coinOps);
  const itemOps = unionOps(a.itemOps, b.itemOps);
  const plantU = maxRec(a.plantU, b.plantU);
  const plantGone = maxRec(a.plantGone, b.plantGone);
  const soilU = maxRec(a.soilU, b.soilU);
  const questU = maxRec(a.questU, b.questU);
  const buildU = maxRec(a.buildU, b.buildU);
  const fenceU = maxRec(a.fenceU, b.fenceU);
  const decorU = maxRec(a.decorU, b.decorU);
  const mobU = maxRec(a.mobU, b.mobU);
  const nodeU = maxRec(a.nodeU, b.nodeU);
  const charU = {
    ogrodnik: Math.max(a.charU.ogrodnik, b.charU.ogrodnik),
    zielarka: Math.max(a.charU.zielarka, b.charU.zielarka),
  };
  const posU = {
    ogrodnik: Math.max(a.posU.ogrodnik, b.posU.ogrodnik),
    zielarka: Math.max(a.posU.zielarka, b.posU.zielarka),
  };
  const state = clone(newer.state);
  const plantIds = new Set<string>([
    ...a.state.plants.map((p) => p.id),
    ...b.state.plants.map((p) => p.id),
    ...Object.keys(plantGone),
  ]);
  const plants: Plant[] = [];
  for (const id of plantIds) {
    const uA = a.plantU[id] ?? 0;
    const uB = b.plantU[id] ?? 0;
    const gone = plantGone[id] ?? 0;
    if (gone > Math.max(uA, uB)) continue;
    const src = uA >= uB ? a : b;
    const plant = src.state.plants.find((p) => p.id === id);
    if (plant) plants.push(clone(plant));
  }
  state.plants = plants;
  const soilKeys = new Set([...Object.keys(a.state.soil), ...Object.keys(b.state.soil)]);
  state.soil = {};
  for (const key of soilKeys) {
    const src = (a.soilU[key] ?? 0) >= (b.soilU[key] ?? 0) ? a : b;
    if (src.state.soil[key]) state.soil[key] = clone(src.state.soil[key]);
  }
  for (const role of ROLES) {
    const body = (a.charU[role] >= b.charU[role] ? a : b).state.characters[role];
    const pos = (a.posU[role] >= b.posU[role] ? a : b).state.characters[role];
    state.characters[role] = clone(body);
    state.characters[role].map = pos.map;
    state.characters[role].x = pos.x;
    state.characters[role].z = pos.z;
    state.characters[role].rot = pos.rot;
  }
  const questIds = new Set([...a.state.quests.map((q) => q.id), ...b.state.quests.map((q) => q.id)]);
  state.quests = [];
  for (const id of questIds) {
    const src = (a.questU[id] ?? 0) >= (b.questU[id] ?? 0) ? a : b;
    const q = src.state.quests.find((x) => x.id === id) ?? (src === a ? b : a).state.quests.find((x) => x.id === id);
    if (q) state.quests.push(clone(q));
  }
  state.buildings = {
    well: a.state.buildings.well || b.state.buildings.well,
    greenhouse: a.state.buildings.greenhouse || b.state.buildings.greenhouse,
    coop: a.state.buildings.coop || b.state.buildings.coop,
    house: a.state.buildings.house || b.state.buildings.house,
  };
  const fenceKeys = new Set<string>([
    ...a.state.fences.map((f) => `${f.c},${f.r}`),
    ...b.state.fences.map((f) => `${f.c},${f.r}`),
  ]);
  state.fences = [...fenceKeys].map((key) => {
    const [c, r] = key.split(',').map(Number);
    return { c, r };
  });
  const decorKeys = new Map<string, { id: string; c: number; r: number }>();
  for (const d of [...a.state.decors, ...b.state.decors]) decorKeys.set(`${d.id}:${d.c},${d.r}`, d);
  state.decors = [...decorKeys.values()].map((d) => clone(d));
  const mobIds = new Set([...a.state.mobs.map((m) => m.id), ...b.state.mobs.map((m) => m.id)]);
  state.mobs = [];
  for (const id of mobIds) {
    const src = (a.mobU[id] ?? 0) >= (b.mobU[id] ?? 0) ? a : b;
    const mob = src.state.mobs.find((m) => m.id === id);
    if (mob) state.mobs.push(clone(mob));
  }
  const nodeKeys = new Set([...a.state.nodes.map((n) => n.key), ...b.state.nodes.map((n) => n.key)]);
  state.nodes = [];
  for (const key of nodeKeys) {
    const src = (a.nodeU[key] ?? 0) >= (b.nodeU[key] ?? 0) ? a : b;
    const node = src.state.nodes.find((n) => n.key === key);
    if (node) state.nodes.push(clone(node));
  }
  state.unlocks = [...new Set([...a.state.unlocks, ...b.state.unlocks])];
  state.orders = [...new Set([...a.state.orders, ...b.state.orders])];
  state.eggs = Math.max(a.state.eggs, b.state.eggs);
  state.weather = clone(newer.state.weather);
  state.lastTick = Math.max(a.state.lastTick, b.state.lastTick);
  state.rev = Math.max(a.state.rev, b.state.rev) + 1;
  const established = a.provisional && !b.provisional ? b : b.provisional && !a.provisional ? a : older;
  const coinBase = established.coinBase;
  state.coins = coinBase + coinOps.reduce((sum, op) => sum + op.delta, 0);
  const itemBase = established.itemBase;
  const folded: WorldDoc = {
    ...newer,
    name,
    v: 1,
    coinBase,
    coinOps,
    itemBase,
    itemOps,
    plantU,
    plantGone,
    soilU,
    charU,
    posU,
    questU,
    buildU,
    fenceU,
    decorU,
    mobU,
    nodeU,
    state,
    savedAt: Date.now(),
    provisional: !!(a.provisional && b.provisional),
  };
  for (const role of ROLES) state.characters[role].inv = foldItems(folded, role);
  folded.state = normalize(state);
  return folded;
}

function indexOf(): WorldCard[] {
  try {
    const raw = localStorage.getItem(INDEX);
    if (!raw) return [];
    const list = JSON.parse(raw) as WorldCard[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: WorldCard[]): void {
  localStorage.setItem(INDEX, JSON.stringify(list));
}

export function listWorlds(): WorldCard[] {
  return indexOf();
}

export function loadWorldLocal(code: string): WorldDoc | null {
  try {
    const raw = localStorage.getItem(PREFIX + code);
    if (!raw) return null;
    const doc = JSON.parse(raw) as WorldDoc;
    if (!doc || doc.v !== 1 || !doc.state) return null;
    doc.state = normalize(doc.state);
    return doc;
  } catch {
    return null;
  }
}

function remember(doc: WorldDoc): void {
  const list = indexOf().filter((w) => w.code !== doc.code);
  list.unshift({ code: doc.code, name: doc.name, role: doc.role });
  writeIndex(list);
  localStorage.setItem(PREFIX + doc.code, JSON.stringify(doc));
  void idbPut(doc);
}

export function saveWorld(doc: WorldDoc): void {
  remember(doc);
}

function idbPut(doc: WorldDoc): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const open = indexedDB.open('piotrogrod-worlds', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'code' });
    };
    open.onerror = () => resolve();
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('worlds', 'readwrite');
      tx.objectStore('worlds').put(doc);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    };
  });
}

export function exportWorldText(doc: WorldDoc): string {
  return JSON.stringify(doc);
}

export function worldLink(doc: WorldDoc): string | null {
  const json = exportWorldText(doc);
  if (json.length > 12000) return null;
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const token = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(location.href);
  url.search = '';
  url.hash = 'swiat=' + token;
  return url.toString();
}

export function parseWorldText(text: string): WorldDoc | null {
  try {
    const doc = JSON.parse(text) as WorldDoc;
    if (!doc || doc.v !== 1 || !doc.code || !doc.state?.characters?.ogrodnik) return null;
    doc.state = normalize(doc.state);
    return doc;
  } catch {
    return null;
  }
}

export function parseWorldLink(token: string): WorldDoc | null {
  try {
    const pad = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return parseWorldText(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function importWorld(doc: WorldDoc, role: Role): WorldDoc {
  const existing = loadWorldLocal(doc.code);
  const next = existing ? mergeWorld(existing, doc) : doc;
  next.role = role;
  saveWorld(next);
  return next;
}
