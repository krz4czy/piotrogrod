import {
  BUILDS,
  ITEMS,
  LINES,
  MAPS,
  MOBS,
  MOB_SPAWNS,
  NPCS,
  ORDERS,
  QUESTS,
  SKILLS,
  getSpecies,
  hybridSpecies,
  itemName,
  linesOf,
  questDef,
  seedId,
  cropId,
  tileCenter,
  tileChar,
  worldToTile,
} from './content.ts';
import { t } from './i18n.ts';

const TUT = {
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
import type {
  ActionMsg,
  ActionView,
  Character,
  EquipSlot,
  GameState,
  MapId,
  Mob,
  NodeRes,
  Plant,
  QuestInst,
  Role,
  Stack,
  Stats,
} from './types.ts';
import { ROLES } from './types.ts';
import { hashStr, hypot, uid } from './util.ts';

const BASE: Record<Role, Stats> = {
  ogrodnik: { maxHp: 100, attack: 6, defense: 1, speed: 2.55, waterMax: 0, growBonus: 0, pestRadius: 0, crossBonus: 0, stormResist: 0 },
  zielarka: { maxHp: 86, attack: 5, defense: 1, speed: 2.55, waterMax: 0, growBonus: 0, pestRadius: 0, crossBonus: 0, stormResist: 0 },
};

export function otherRole(role: Role): Role {
  return role === 'ogrodnik' ? 'zielarka' : 'ogrodnik';
}

export function xpNeed(level: number): number {
  return 18 + (level - 1) * 16;
}

export function computeStats(s: GameState, role: Role): Stats {
  const ch = s.characters[role];
  const st: Stats = { ...BASE[role] };
  for (const id of Object.values(ch.equip)) {
    if (!id) continue;
    const it = ITEMS[id];
    if (!it?.stats) continue;
    addStats(st, it.stats);
  }
  for (const sid of ch.skills) {
    const sk = SKILLS.find((x) => x.id === sid);
    if (sk?.stats) addStats(st, sk.stats);
  }
  return st;
}

function addStats(st: Stats, extra: Partial<Stats>): void {
  (Object.keys(extra) as (keyof Stats)[]).forEach((k) => {
    st[k] += extra[k] ?? 0;
  });
}

export function hasSkill(s: GameState, role: Role, id: string): boolean {
  return s.characters[role].skills.includes(id);
}

function blankChar(role: Role, x: number, z: number): Character {
  return {
    role, map: 'ogrod', x, z, rot: Math.PI, hp: 100, downed: false, downedAt: 0,
    xp: 0, level: 1, skillPoints: 0, skills: [], inv: [], equip: {}, water: 0,
    sitting: false, anim: 'idle', emote: '', emoteUntil: 0, invulnUntil: 0,
    posLockUntil: 0, slowUntil: 0, cd: {}, buffDefUntil: 0, buffDef: 0,
  };
}

export function createGame(now: number): GameState {
  const og = MAPS.ogrod;
  const a = tileCenter(og, 3, 10);
  const b = tileCenter(og, 6, 10);
  const ogrodnik = blankChar('ogrodnik', a.x, a.z);
  const zielarka = blankChar('zielarka', b.x, b.z);
  ogrodnik.equip = { hat: 'kapelusz_sloma', boots: 'buty_drewniaki', tool: 'motyka_drewno' };
  ogrodnik.inv = [
    { id: 'seed_marchew', n: 6 },
    { id: 'seed_salata', n: 4 },
    { id: 'seed_stokrotka', n: 4 },
    { id: 'bandaz', n: 1 },
  ];
  zielarka.equip = { hat: 'wianek', gloves: 'rekawice_lniane', tool: 'konewka_drewno' };
  zielarka.inv = [
    { id: 'kompost', n: 3 },
    { id: 'bandaz', n: 1 },
  ];
  const s: GameState = {
    v: 1,
    rev: 1,
    createdAt: now,
    lastTick: now,
    coins: 20,
    unlocks: [],
    buildings: { well: true, greenhouse: false, coop: false, house: false },
    fences: [],
    decors: [],
    soil: {},
    plants: [],
    mobs: [],
    spawners: [],
    nodes: [],
    ensured: [],
    quests: [],
    orders: ['koszyk', 'jajka'],
    eggs: 0,
    nextEgg: 0,
    weather: { kind: 'clear', until: 0, nextAt: now + 120000, secured: false, seenGarden: false, protected: 0 },
    nextPest: now + 22000,
    characters: { ogrodnik, zielarka },
    connected: { ogrodnik: false, zielarka: false },
    invite: null,
    notices: [],
    noticeSeq: 0,
    fx: [],
    fxSeq: 0,
    flags: {},
  };
  ogrodnik.hp = computeStats(s, 'ogrodnik').maxHp;
  zielarka.hp = computeStats(s, 'zielarka').maxHp;
  zielarka.water = computeStats(s, 'zielarka').waterMax;
  ensureMap(s, 'ogrod');
  ensureMap(s, 'wies');
  refreshQuests(s);
  return s;
}

export function normalize(raw: GameState): GameState {
  const s = raw;
  s.v = 1;
  s.fences ||= [];
  s.decors ||= [];
  s.soil ||= {};
  s.plants ||= [];
  s.mobs ||= [];
  s.spawners ||= [];
  s.nodes ||= [];
  s.ensured ||= [];
  s.quests ||= [];
  s.orders ||= ['koszyk', 'jajka'];
  s.notices ||= [];
  s.fx ||= [];
  s.flags ||= {};
  s.unlocks ||= [];
  s.buildings ||= { well: true, greenhouse: false, coop: false, house: false };
  s.weather ||= { kind: 'clear', until: 0, nextAt: Date.now() + 90000, secured: false, seenGarden: false, protected: 0 };
  s.connected = { ogrodnik: false, zielarka: false };
  s.invite = s.invite ?? null;
  for (const role of ROLES) {
    const ch = s.characters[role];
    ch.inv ||= [];
    ch.equip ||= {};
    ch.skills ||= [];
    ch.cd ||= {};
    ch.anim ||= 'idle';
    ch.emote ||= '';
  }
  return s;
}

export function isState(x: unknown): x is GameState {
  if (!x || typeof x !== 'object') return false;
  const s = x as GameState;
  return s.v === 1 && !!s.characters?.ogrodnik && !!s.characters?.zielarka && Array.isArray(s.plants);
}

function say(s: GameState, role: Role | 'all', key: string, vars?: Record<string, string | number>, sfx?: string): void {
  pushNotice(s, role, t(key, vars), sfx);
}

function sfxOnly(s: GameState, role: Role | 'all', name: string): void {
  pushNotice(s, role, '', name);
}

function noteTut(s: GameState, key: string): void {
  s.flags[key] = (s.flags[key] ?? 0) + 1;
}

function tutBed(s: GameState, pred: (c: number, r: number) => boolean): { c: number; r: number } | null {
  const rows = MAPS.ogrod.rows;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== 'b') continue;
      if (s.plants.some((p) => p.c === c && p.r === r)) continue;
      if (!pred(c, r)) continue;
      return { c, r };
    }
  }
  return null;
}

function tutPlant(s: GameState, c: number, r: number, species: string, patch: Partial<Plant>): void {
  if (s.plants.some((p) => p.c === c && p.r === r)) return;
  s.soil[soilKey(c, r)] = { tilled: true, wetUntil: 0 };
  s.plants.push({
    id: uid('p'), c, r, species, stage: 'sprout', plantedBy: 'ogrodnik', hybrid: false,
    needsWater: false, needsPrune: false, needsHeal: false, fertilized: false,
    quality: 1, since: Date.now(), readyAt: null, staked: false, covered: false,
    ...patch,
  });
}

function prepTutorial(s: GameState, role: Role, step: string, now: number): void {
  if (step === 'prune' && !s.plants.some((p) => p.needsPrune)) {
    const bed = tutBed(s, () => true);
    if (bed) tutPlant(s, bed.c, bed.r, 'salata', { needsPrune: true, stage: 'sprout' });
  }
  if (step === 'pest') {
    const ch = s.characters[role];
    const near = s.mobs.some((m) => m.map === ch.map && !m.deadAt && MOBS[m.kind]?.pest && hypot(ch.x, ch.z, m.x, m.z) < 2.4);
    if (!near) {
      const mob = makeMob('slimak', ch.map, ch.x + Math.sin(ch.rot) * 0.95, ch.z + Math.cos(ch.rot) * 0.95);
      s.mobs.push(mob);
    }
  }
  if (step === 'fill') s.characters.zielarka.water = 0;
  if (step === 'water' && !s.plants.some((p) => p.needsWater)) {
    const bed = tutBed(s, () => true);
    if (bed) tutPlant(s, bed.c, bed.r, 'marchew', { needsWater: true, stage: 'seed' });
  }
  if (step === 'fert') {
    if (countOne(s.characters.zielarka, 'kompost') < 1) addItem(s.characters.zielarka, 'kompost', 1);
    const live = s.plants.find((p) => p.stage !== 'mature' && !p.fertilized);
    if (!live) {
      const bed = tutBed(s, () => true);
      if (bed) tutPlant(s, bed.c, bed.r, 'salata', { stage: 'growing', needsWater: false });
    }
  }
  if (step === 'heal') {
    const partner = s.characters[otherRole(role)];
    const max = computeStats(s, otherRole(role)).maxHp;
    if (partner.hp > max - 8) partner.hp = Math.max(12, max - 28);
    if (countOne(s.characters.zielarka, 'bandaz') < 1) addItem(s.characters.zielarka, 'bandaz', 1);
  }
  if (step === 'cross' && !s.plants.some((p) => p.species === 'stokrotka' && p.stage === 'mature' && s.plants.some((q) => q !== p && q.species === 'stokrotka' && q.stage === 'mature' && Math.hypot(p.c - q.c, p.r - q.r) <= 1.5))) {
    const a = tutBed(s, (c, r) => !s.plants.some((p) => p.c === c + 1 && p.r === r) && MAPS.ogrod.rows[r]?.[c + 1] === 'b');
    if (a) {
      tutPlant(s, a.c, a.r, 'stokrotka', { stage: 'mature', needsWater: false });
      tutPlant(s, a.c + 1, a.r, 'stokrotka', { stage: 'mature', needsWater: false });
    }
  }
  if (step === 'harvest') {
    if (!s.plants.some((p) => p.stage === 'mature' && getSpecies(p.species).kind !== 'kwiat')) {
      const bed = tutBed(s, () => true);
      if (bed) tutPlant(s, bed.c, bed.r, 'marchew', { stage: 'mature', needsWater: false });
    }
    if (!s.nodes.some((n) => n.key === 'tut-herb' && n.left > 0)) {
      s.nodes.push({ key: 'tut-herb', map: 'ogrod', c: 1, r: 10, kind: 'herb', left: 2, respawn: 0 });
    }
  }
  if (step === 'skills') {
    const ch = s.characters[role];
    if (ch.level < 2) grantXp(s, role, Math.max(1, xpNeed(ch.level) - ch.xp), now);
    else noteTut(s, TUT.level);
  }
}

function pushNotice(s: GameState, role: Role | 'all', msg: string, sfx?: string): void {
  s.noticeSeq += 1;
  s.notices.push({ id: s.noticeSeq, role, msg, sfx, until: Date.now() + 3200 });
  if (s.notices.length > 10) s.notices.splice(0, s.notices.length - 10);
}

function fx(s: GameState, map: MapId, x: number, z: number, kind: string, text?: string, color?: string, ms = 700): void {
  s.fxSeq += 1;
  s.fx.push({ id: s.fxSeq, kind, map, x, z, until: Date.now() + ms, text, color });
  if (s.fx.length > 36) s.fx.splice(0, s.fx.length - 36);
}

function bump(s: GameState): void {
  s.rev += 1;
}

export function catchUp(s: GameState, now: number): void {
  const gap = now - s.lastTick;
  if (gap > 3000) {
    const before = s.plants.map((p) => p.stage).join(',');
    advancePlants(s, now);
    if (s.buildings.coop) {
      let guard = 0;
      while (s.eggs < 4 && s.nextEgg > 0 && s.nextEgg <= now && guard++ < 12) {
        s.eggs += 1;
        s.nextEgg += 35000;
      }
      if (s.nextEgg < now) s.nextEgg = now + 35000;
    }
    for (const n of s.nodes) {
      if (n.left <= 0 && n.respawn <= now) n.left = n.kind === 'ore' ? 3 : 2;
    }
    if (s.weather.kind !== 'clear') s.weather.kind = 'clear';
    if (s.weather.nextAt < now + 20000) s.weather.nextAt = now + 70000;
    const after = s.plants.map((p) => p.stage).join(',');
    if (before !== after && gap > 8000) say(s, 'all', 'toast.offline_grow', undefined, 'ok');
    for (const role of ROLES) {
      const ch = s.characters[role];
      if (ch.downed && now - ch.downedAt > 20000) doRevive(s, role, 0.4, now);
    }
  }
  s.lastTick = now;
  bump(s);
}

export function ensureMap(s: GameState, mapId: MapId): void {
  if (s.ensured.includes(mapId)) return;
  s.ensured.push(mapId);
  const map = MAPS[mapId];
  for (const sp of MOB_SPAWNS[mapId]) {
    const p = tileCenter(map, sp.c, sp.r);
    const mob = makeMob(sp.kind, mapId, p.x, p.z);
    s.mobs.push(mob);
    s.spawners.push({ id: uid('s'), map: mapId, kind: sp.kind, x: p.x, z: p.z, mobId: mob.id, respawnAt: 0 });
  }
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      const ch = map.rows[r][c];
      const kind = ch === 'o' ? 'ore' : ch === 'm' ? 'shroom' : ch === 'z' ? 'herb' : null;
      if (!kind) continue;
      const key = `${mapId}:${c},${r}`;
      s.nodes.push({ key, map: mapId, c, r, kind, left: kind === 'ore' ? 3 : 2, respawn: 0 });
    }
  }
}

function makeMob(kind: string, map: MapId, x: number, z: number): Mob {
  const def = MOBS[kind];
  return {
    id: uid('m'), kind, map, x, z, rot: 0, hp: def.hp, maxHp: def.hp, ai: 'wander',
    cd: 0.4, peck: 0, deadAt: 0, aggroUntil: 0, slowUntil: 0, homeX: x, homeZ: z,
    vx: 1, vz: 0, wander: 0, chargeLeft: 0, split: kind === 'szlam_maly',
  };
}

function soilKey(c: number, r: number): string {
  return `${c},${r}`;
}

export function tileBlocks(s: GameState, mapId: MapId, c: number, r: number): boolean {
  const map = MAPS[mapId];
  const ch = tileChar(map, c, r);
  if (ch === 't' || ch === 'k' || ch === 'F' || ch === 'S' || ch === 'W') return true;
  if (ch === 'H' && (mapId === 'wies' || s.buildings.house)) return true;
  if (ch === 'C' && s.buildings.coop) return true;
  if (mapId === 'ogrod' && s.fences.some((f) => f.c === c && f.r === r)) return true;
  return false;
}

function circleBlocked(s: GameState, mapId: MapId, x: number, z: number, radius = 0.28): boolean {
  const map = MAPS[mapId];
  const pts = [
    [x, z],
    [x + radius, z],
    [x - radius, z],
    [x, z + radius],
    [x, z - radius],
  ];
  for (const [px, pz] of pts) {
    const t = worldToTile(map, px, pz);
    if (!t) return true;
    if (tileBlocks(s, mapId, t.c, t.r)) return true;
  }
  return false;
}

export function movePlayer(s: GameState, role: Role, ix: number, iz: number, dt: number, now: number): void {
  const ch = s.characters[role];
  if (ch.downed || ch.posLockUntil > now) {
    if (ch.downed) ch.anim = 'down';
    return;
  }
  const mag = Math.hypot(ix, iz);
  if (mag < 0.12) {
    if (ch.anim === 'walk') ch.anim = 'idle';
    return;
  }
  if (ch.sitting) ch.sitting = false;
  const st = computeStats(s, role);
  let speed = st.speed * Math.min(1, mag);
  if (ch.slowUntil > now) speed *= 0.72;
  const under = worldToTile(MAPS[ch.map], ch.x, ch.z);
  if (under?.ch === 'd') speed *= 0.46;
  else if (under?.ch === 'a') speed *= 0.78;
  const vx = (ix / mag) * speed * dt;
  const vz = (iz / mag) * speed * dt;
  if (!circleBlocked(s, ch.map, ch.x + vx, ch.z)) ch.x += vx;
  if (!circleBlocked(s, ch.map, ch.x, ch.z + vz)) ch.z += vz;
  ch.rot = Math.atan2(ix, iz);
  if (!(ch.cd.swing > now)) ch.anim = 'walk';
}

export interface Ctx {
  tile: { c: number; r: number; ch: string } | null;
  plant: Plant | null;
  npc: (typeof NPCS)[number] | null;
  nearWell: boolean;
  nearCoop: boolean;
  nearGh: boolean;
  nearBench: boolean;
  node: NodeRes | null;
  exitTo: MapId | null;
  partnerNear: boolean;
  partnerDown: boolean;
  foe: boolean;
}

export function contextOf(s: GameState, role: Role): Ctx {
  const ch = s.characters[role];
  const map = MAPS[ch.map];
  const fx = ch.x + Math.sin(ch.rot) * 0.9;
  const fz = ch.z + Math.cos(ch.rot) * 0.9;
  const tile = worldToTile(map, fx, fz);
  let plant: Plant | null = null;
  if (ch.map === 'ogrod' && tile) plant = s.plants.find((p) => p.c === tile.c && p.r === tile.r) ?? null;
  if (!plant && ch.map === 'ogrod') {
    let best = 1.2;
    for (const p of s.plants) {
      const pos = tileCenter(map, p.c, p.r);
      const d = hypot(ch.x, ch.z, pos.x, pos.z);
      const dx = pos.x - ch.x;
      const dz = pos.z - ch.z;
      const dot = dx * Math.sin(ch.rot) + dz * Math.cos(ch.rot);
      if (d < best && (dot > 0.15 || d < 0.75)) {
        best = d;
        plant = p;
      }
    }
  }
  let npc: Ctx['npc'] = null;
  let nd = 1.6;
  for (const n of NPCS) {
    if (n.map !== ch.map) continue;
    const p = tileCenter(MAPS[n.map], n.c, n.r);
    const d = hypot(ch.x, ch.z, p.x, p.z);
    if (d < nd) {
      nd = d;
      npc = n;
    }
  }
  const nearWell = ch.map === 'ogrod' && hypot(ch.x, ch.z, tileCenter(MAPS.ogrod, 9, 3).x, tileCenter(MAPS.ogrod, 9, 3).z) < 1.6;
  const nearCoop = ch.map === 'ogrod' && s.buildings.coop && hypot(ch.x, ch.z, tileCenter(MAPS.ogrod, 2, 6).x, tileCenter(MAPS.ogrod, 2, 6).z) < 1.65;
  let nearGh = false;
  if (ch.map === 'ogrod') {
    for (let r = 0; r < MAPS.ogrod.rows.length && !nearGh; r++) {
      for (let c = 0; c < MAPS.ogrod.cols; c++) {
        if (MAPS.ogrod.rows[r][c] !== 'G') continue;
        const p = tileCenter(MAPS.ogrod, c, r);
        if (hypot(ch.x, ch.z, p.x, p.z) < 2.5) nearGh = true;
      }
    }
  }
  const seat = tileCenter(MAPS.ogrod, role === 'ogrodnik' ? 2 : 3, 9);
  const nearBench = ch.map === 'ogrod' && s.buildings.house && hypot(ch.x, ch.z, seat.x, seat.z) < 1.55;
  let node: NodeRes | null = null;
  let nodeD = 1.35;
  for (const n of s.nodes) {
    if (n.map !== ch.map || n.left <= 0) continue;
    const p = tileCenter(MAPS[n.map], n.c, n.r);
    const d = Math.min(hypot(ch.x, ch.z, p.x, p.z), hypot(fx, fz, p.x, p.z));
    if (d < nodeD) {
      nodeD = d;
      node = n;
    }
  }
  const under = worldToTile(map, ch.x, ch.z);
  let exitTo: MapId | null = null;
  if (under?.ch === 'e') {
    exitTo = map.exits.find((e) => e.c === under.c && e.r === under.r)?.to ?? null;
  }
  const partner = s.characters[otherRole(role)];
  const partnerNear = partner.map === ch.map && hypot(ch.x, ch.z, partner.x, partner.z) < 2.4;
  const partnerDown = partner.downed && partner.map === ch.map && hypot(ch.x, ch.z, partner.x, partner.z) < 1.65;
  const foe = foesInCone(s, role, 1.45, 0.2).length > 0;
  return { tile, plant, npc, nearWell, nearCoop, nearGh, nearBench, node, exitTo, partnerNear, partnerDown, foe };
}

function foesInCone(s: GameState, role: Role, radius: number, minDot: number): Mob[] {
  const ch = s.characters[role];
  const fx = Math.sin(ch.rot);
  const fz = Math.cos(ch.rot);
  const out: Mob[] = [];
  for (const m of s.mobs) {
    if (m.map !== ch.map || m.deadAt) continue;
    const dx = m.x - ch.x;
    const dz = m.z - ch.z;
    const d = Math.hypot(dx, dz);
    if (d > radius || d < 0.001) continue;
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot >= minDot || d < 0.72) out.push(m);
  }
  return out;
}

function pestsInRange(s: GameState, role: Role): Mob[] {
  const extra = computeStats(s, role).pestRadius;
  return foesInCone(s, role, 1.5 + extra, 0.05).filter((m) => MOBS[m.kind]?.pest);
}

function view(id: string, enabled: boolean, reason = '', panel?: ActionView['panel'], item?: string): ActionView {
  return { id, label: t('action.' + id), enabled, reason, panel, item };
}

export function listActions(s: GameState, role: Role, now: number): ActionView[] {
  const ch = s.characters[role];
  const ctx = contextOf(s, role);
  const list: ActionView[] = [];
  const cd = (key: string) => (ch.cd[key] ?? 0) > now;
  if (role === 'ogrodnik') {
    const bed = ctx.tile?.ch === 'b';
    const soil = bed && ctx.tile ? s.soil[soilKey(ctx.tile.c, ctx.tile.r)] : undefined;
    const empty = bed && ctx.tile && !s.plants.some((p) => p.c === ctx.tile!.c && p.r === ctx.tile!.r);
    list.push(view('kop', !!bed && !!empty && !soil?.tilled, t('reason.till')));
    const seeds = ch.inv.some((it) => it.id.startsWith('seed_') && it.n > 0);
    list.push(view('siej', !!bed && !!empty && !!soil?.tilled && seeds, seeds ? t('reason.sow') : t('toast.no_seed'), 'seeds'));
    list.push(view('przytnij', !!ctx.plant?.needsPrune, t('reason.prune')));
    list.push(view('buduj', ch.map === 'ogrod', t('toast.build_no'), 'build'));
    list.push(view('gon', pestsInRange(s, role).length > 0, t('reason.chase')));
    list.push(view('zbierz', ctx.plant?.stage === 'mature', t('reason.harvest')));
    if (ctx.node?.kind === 'ore') list.push(view('wydobadz', ctx.node.left > 0, t('reason.ore')));
  } else {
    const can = ch.equip.tool?.startsWith('konewka');
    const thirsty = !!ctx.plant?.needsWater;
    list.push(view('podlej', !!can && thirsty && ch.water > 0, !can ? t('reason.tool') : ch.water <= 0 ? t('reason.empty') : t('reason.water')));
    const compost = countOne(ch, 'kompost') > 0;
    list.push(view('nawoz', compost && !!ctx.plant && ctx.plant.stage !== 'mature' && !ctx.plant.fertilized, compost ? t('reason.fert') : t('toast.no_compost')));
    list.push(view('lecz', !!ctx.plant?.needsHeal, t('reason.heal')));
    list.push(view('krzyzuj', crossPair(s, role) !== null, t('reason.cross')));
    const gather = ctx.node && (ctx.node.kind === 'shroom' || ctx.node.kind === 'herb');
    list.push(view('zbierz', !!gather, t('reason.herb')));
    list.push(view('napelnij', ctx.nearWell && ch.water < computeStats(s, role).waterMax, ctx.nearWell ? t('toast.water_full') : t('reason.refill')));
  }
  list.push(view('atak', ctx.foe && !cd('atak'), cd('atak') ? t('reason.cd') : t('reason.attack')));
  if (hasSkill(s, role, 'og_szarza')) list.push(view('szarza', !cd('szarza'), t('reason.cd')));
  if (hasSkill(s, role, 'zi_uzdrow')) list.push(view('uzdrow', !cd('uzdrow'), t('reason.cd')));
  if (hasSkill(s, role, 'zi_pylek')) list.push(view('pylek', !cd('pylek'), t('reason.cd')));
  if (ctx.partnerDown) list.push(view('ocuc', true, ''));
  if (ctx.npc) list.push(view('rozmowa', true, ''));
  if (ctx.nearCoop && s.eggs > 0) list.push(view('jajka', true, ''));
  if (ctx.nearBench) list.push(view(ch.sitting ? 'wstan' : 'usiadz', true, ''));
  const storm = s.weather.kind === 'warning' || s.weather.kind === 'storm';
  if (storm && role === 'ogrodnik' && ch.map === 'ogrod') list.push(view('zabezpiecz', ctx.nearGh || !!ctx.plant, t('reason.storm')));
  if (storm && role === 'zielarka' && ch.map === 'ogrod') list.push(view('oslon', !!ctx.plant, t('reason.storm')));
  const healId = bestHealId(s, role, now);
  if (healId && ch.hp < computeStats(s, role).maxHp) list.push(view('uzyj', true, '', undefined, healId));
  return list;
}

function bestHealId(s: GameState, role: Role, now: number): string | null {
  const ch = s.characters[role];
  if (ch.slowUntil > now && countOne(ch, 'masc') > 0) return 'masc';
  if (countOne(ch, 'bandaz') > 0) return 'bandaz';
  if (countOne(ch, 'miod') > 0) return 'miod';
  if (countOne(ch, 'masc') > 0) return 'masc';
  return null;
}

export function countOne(ch: Character, id: string): number {
  return ch.inv.filter((st) => st.id === id).reduce((a, st) => a + st.n, 0);
}

export function countBoth(s: GameState, id: string): number {
  return countOne(s.characters.ogrodnik, id) + countOne(s.characters.zielarka, id);
}

function countHybridGh(s: GameState): number {
  let n = 0;
  for (const role of ROLES) {
    for (const st of s.characters[role].inv) {
      if (!st.id.startsWith('crop_')) continue;
      if (st.meta?.includes('hyb') && st.meta?.includes('gh')) n += st.n;
    }
  }
  return n;
}

function canAdd(ch: Character, id: string, meta?: string): boolean {
  const def = ITEMS[id];
  if (!def) return false;
  const key = id + '|' + (meta ?? '');
  for (const st of ch.inv) {
    if (st.id + '|' + (st.meta ?? '') === key && st.n < def.stack) return true;
  }
  return ch.inv.length < 24;
}

function addItem(ch: Character, id: string, n: number, meta?: string): boolean {
  const def = ITEMS[id];
  if (!def || n <= 0) return false;
  const key = id + '|' + (meta ?? '');
  let left = n;
  for (const st of ch.inv) {
    if (st.id + '|' + (st.meta ?? '') === key) {
      const put = Math.min(def.stack - st.n, left);
      st.n += put;
      left -= put;
    }
  }
  while (left > 0 && ch.inv.length < 24) {
    const put = Math.min(def.stack, left);
    const stack: Stack = { id, n: put };
    if (meta) stack.meta = meta;
    ch.inv.push(stack);
    left -= put;
  }
  return left === 0;
}

function removeId(ch: Character, id: string, n: number, meta?: string): number {
  let left = n;
  for (const st of ch.inv) {
    if (left <= 0) break;
    if (st.id !== id) continue;
    if (meta !== undefined && (st.meta ?? '') !== meta) continue;
    const take = Math.min(st.n, left);
    st.n -= take;
    left -= take;
  }
  ch.inv = ch.inv.filter((st) => st.n > 0);
  return n - left;
}

function takeBoth(s: GameState, id: string, n: number, prefer: Role, metaPred?: (meta?: string) => boolean): boolean {
  const have = [prefer, otherRole(prefer)].reduce((sum, role) => {
    return sum + s.characters[role].inv.filter((st) => st.id === id && (!metaPred || metaPred(st.meta))).reduce((a, st) => a + st.n, 0);
  }, 0);
  if (id === 'hybrid_gh') {
    if (countHybridGh(s) < n) return false;
  } else if (have < n && id !== 'hybrid_gh') return false;
  let left = n;
  for (const role of [prefer, otherRole(prefer)]) {
    const ch = s.characters[role];
    for (const st of [...ch.inv]) {
      if (left <= 0) break;
      const ok = id === 'hybrid_gh'
        ? st.id.startsWith('crop_') && !!st.meta?.includes('hyb') && !!st.meta?.includes('gh')
        : st.id === id && (!metaPred || metaPred(st.meta));
      if (!ok) continue;
      const take = Math.min(st.n, left);
      st.n -= take;
      left -= take;
    }
    ch.inv = ch.inv.filter((st) => st.n > 0);
  }
  return left <= 0;
}

function grantXp(s: GameState, role: Role, amount: number, _now: number): void {
  if (amount <= 0) return;
  const ch = s.characters[role];
  ch.xp += amount;
  let guard = 0;
  while (ch.level < 8 && ch.xp >= xpNeed(ch.level) && guard++ < 6) {
    ch.xp -= xpNeed(ch.level);
    ch.level += 1;
    ch.skillPoints += 1;
    noteTut(s, TUT.level);
    say(s, 'all', 'toast.level', { name: t('role.' + role), n: ch.level }, 'level');
    fx(s, ch.map, ch.x, ch.z, 'level', t('hud.lvl', { n: ch.level }), '#ffd23a', 1200);
  }
}

function onEvent(s: GameState, ev: Record<string, unknown>): void {
  for (const q of s.quests) {
    if (q.status !== 'active') continue;
    const def = questDef(q.id);
    def.objectives.forEach((o, i) => {
      if (o.type === 'give') return;
      if (o.type !== ev.type) return;
      if (o.type === 'talk' && o.npc !== ev.npc) return;
      if (o.type === 'kill' && o.kind !== ev.kind) return;
      if (o.type === 'build' && o.build !== ev.build) return;
      if (o.type === 'both_on' && o.map !== ev.map) return;
      if (o.type === 'harvest') {
        if (o.hybrid && !ev.hybrid) return;
        if (o.greenhouse && !ev.greenhouse) return;
      }
      const k = 'o' + i;
      const cur = q.progress[k] ?? 0;
      if (cur >= o.n) return;
      q.progress[k] = Math.min(o.n, cur + (typeof ev.n === 'number' ? ev.n : 1));
    });
  }
}

export function refreshQuests(s: GameState): void {
  for (const def of QUESTS) {
    const req = def.requires.every((id) => s.quests.find((q) => q.id === id)?.status === 'done');
    if (!req) continue;
    if (!s.quests.some((q) => q.id === def.id)) {
      s.quests.push({ id: def.id, status: def.kind === 'main' ? 'active' : 'available', progress: {} });
    }
  }
  if (s.unlocks.includes('seed_mieta') && !s.orders.includes('mieta')) s.orders.push('mieta');
  if (s.buildings.greenhouse && !s.orders.includes('bukiet')) s.orders.push('bukiet');
}

export function isReady(s: GameState, q: QuestInst): boolean {
  const def = questDef(q.id);
  return def.objectives.every((o, i) => {
    if (o.type === 'give') return countBoth(s, o.item ?? '') >= o.n;
    return (q.progress['o' + i] ?? 0) >= o.n;
  });
}

export function objectiveLine(s: GameState, q: QuestInst, i: number): { cur: number; n: number; text: string; done: boolean } {
  const o = questDef(q.id).objectives[i];
  const cur = o.type === 'give' ? Math.min(o.n, countBoth(s, o.item ?? '')) : (q.progress['o' + i] ?? 0);
  return { cur, n: o.n, text: t(`quest.${q.id}.o${i}`, { cur, n: o.n }), done: cur >= o.n };
}

export function trackerLine(s: GameState): string {
  const main = s.quests.find((q) => q.status === 'active' && questDef(q.id).kind === 'main');
  if (!main) return t('quest.trackerNone');
  const def = questDef(main.id);
  const idx = def.objectives.findIndex((_, i) => !objectiveLine(s, main, i).done);
  const title = t('quest.' + main.id + '.title');
  if (idx < 0) return `${title} — ${t('quest.turn')}`;
  return `${title}: ${objectiveLine(s, main, idx).text}`;
}

export function npcMarker(s: GameState, npcId: string): 'none' | 'new' | 'turn' {
  if (s.quests.some((q) => q.status === 'active' && questDef(q.id).npc === npcId && isReady(s, q))) return 'turn';
  if (s.quests.some((q) => q.status === 'available' && questDef(q.id).npc === npcId)) return 'new';
  for (const q of s.quests) {
    if (q.status !== 'active') continue;
    const def = questDef(q.id);
    if (def.objectives.some((o, i) => o.type === 'talk' && o.npc === npcId && (q.progress['o' + i] ?? 0) < o.n)) return 'new';
  }
  return 'none';
}

function snap(s: GameState, role: Role, a: ActionMsg): void {
  const ch = s.characters[role];
  if (typeof a.x !== 'number') return;
  if (hypot(ch.x, ch.z, a.x, a.z) < 3) {
    ch.x = a.x;
    ch.z = a.z;
    ch.rot = a.rot;
  }
}

function gkey(role: Role, base: string): string {
  return base + (role === 'ogrodnik' ? '_m' : '_f');
}

export function applyAction(s: GameState, role: Role, a: ActionMsg, now: number): void {
  const ch = s.characters[role];
  if (!ch) return;
  snap(s, role, a);
  if (ch.downed && a.id !== 'emote') {
    say(s, role, 'toast.cant_move', undefined, 'bad');
    bump(s);
    return;
  }
  if (a.id !== 'emote' && a.id !== 'pos' && a.id !== 'tut_prep' && a.id !== 'tut_flag') {
    if ((ch.cd.gate ?? 0) > now) return;
    ch.cd.gate = now + 130;
  }
  const ctx = contextOf(s, role);
  switch (a.id) {
    case 'kop': actTill(s, role, ctx, now); break;
    case 'siej': actSow(s, role, ctx, a, now); break;
    case 'przytnij': actPrune(s, role, ctx, now); break;
    case 'zbierz': actGather(s, role, ctx, now); break;
    case 'podlej': actWater(s, role, ctx, now); break;
    case 'nawoz': actFert(s, role, ctx, now); break;
    case 'lecz': actHealPlant(s, role, ctx, now); break;
    case 'krzyzuj': actCross(s, role, now); break;
    case 'napelnij': actRefill(s, role, ctx, now); break;
    case 'gon': actChase(s, role, now); break;
    case 'buduj': actBuild(s, role, a, now); break;
    case 'atak': actAttack(s, role, now, 1, 1.4, 0.22, 'atak', 520); break;
    case 'szarza': actDash(s, role, now); break;
    case 'pylek': actAttack(s, role, now, 0.85, 2.55, 0.1, 'pylek', 7000, 'pylek'); break;
    case 'uzdrow': actHealHero(s, role, now); break;
    case 'ocuc': actRevive(s, role, now); break;
    case 'wydobadz': actMine(s, role, ctx, now); break;
    case 'jajka': actEggs(s, role, ctx, now); break;
    case 'usiadz':
    case 'wstan': actSit(s, role, now); break;
    case 'zabezpiecz': actStake(s, role, ctx, now); break;
    case 'oslon': actCover(s, role, ctx, now); break;
    case 'uzyj': actUse(s, role, a.item ?? '', now); break;
    case 'talk': actTalk(s, role, a.npc ?? '', now); break;
    case 'emote': actEmote(s, role, now); break;
    case 'equip': actEquip(s, role, a.item ?? ''); break;
    case 'unequip': actUnequip(s, role, a.item ?? ''); break;
    case 'give': actGive(s, role, a, now); break;
    case 'skill': actSkill(s, role, a.skill ?? ''); break;
    case 'buy': actBuy(s, role, a.item ?? ''); break;
    case 'sell': actSell(s, role, a, now); break;
    case 'order': actOrder(s, role, a.order ?? '', now); break;
    case 'quest_accept': actAccept(s, role, a.quest ?? ''); break;
    case 'quest_turnin': actTurnin(s, role, a.quest ?? '', now); break;
    case 'travel': actTravel(s, role, a.map, a.meta === 'call', now); break;
    case 'accept_invite': actAcceptInvite(s, role, now); break;
    case 'decline_invite': s.invite = null; break;
    case 'tut_prep': prepTutorial(s, role, a.meta ?? '', now); break;
    case 'tut_flag': if (a.meta?.startsWith('tut_')) noteTut(s, a.meta); break;
    default: break;
  }
  bump(s);
}

function actTill(s: GameState, role: Role, ctx: Ctx, now: number): void {
  if (role !== 'ogrodnik' || !ctx.tile || ctx.tile.ch !== 'b') {
    say(s, role, 'toast.till_no', undefined, 'bad');
    return;
  }
  if (s.plants.some((p) => p.c === ctx.tile!.c && p.r === ctx.tile!.r)) {
    say(s, role, 'toast.occupied', undefined, 'bad');
    return;
  }
  const key = soilKey(ctx.tile.c, ctx.tile.r);
  const cell = s.soil[key] ?? { tilled: false, wetUntil: 0 };
  if (cell.tilled) {
    say(s, role, 'toast.till_no', undefined, 'bad');
    return;
  }
  cell.tilled = true;
  s.soil[key] = cell;
  onEvent(s, { type: 'till', n: 1 });
  noteTut(s, TUT.dig);
  grantXp(s, role, 2, now);
  say(s, role, gkey(role, 'toast.till'), undefined, 'dig');
  s.characters[role].cd.swing = now + 280;
}

function actSow(s: GameState, role: Role, ctx: Ctx, a: ActionMsg, now: number): void {
  const species = a.species ?? '';
  const sp = SPECIES_SAFE(species);
  if (!sp || !ctx.tile || ctx.tile.ch !== 'b') {
    say(s, role, 'toast.sow_no', undefined, 'bad');
    return;
  }
  const key = soilKey(ctx.tile.c, ctx.tile.r);
  if (!s.soil[key]?.tilled || s.plants.some((p) => p.c === ctx.tile!.c && p.r === ctx.tile!.r)) {
    say(s, role, 'toast.sow_no', undefined, 'bad');
    return;
  }
  const sid = seedId(species);
  if (countOne(s.characters[role], sid) <= 0) {
    say(s, role, 'toast.no_seed', undefined, 'bad');
    return;
  }
  removeId(s.characters[role], sid, 1);
  const plant: Plant = {
    id: uid('p'), c: ctx.tile.c, r: ctx.tile.r, species, stage: 'seed', plantedBy: role,
    hybrid: sp.hybrid, needsWater: true, needsPrune: false, needsHeal: false, fertilized: false,
    quality: 1, since: now, readyAt: null, staked: false, covered: false,
  };
  s.plants.push(plant);
  onEvent(s, { type: 'plant', n: 1 });
  noteTut(s, TUT.sow);
  grantXp(s, role, 3, now);
  say(s, role, gkey(role, 'toast.sow'), { name: sp.name }, 'sow');
  s.characters[role].cd.swing = now + 280;
}

function SPECIES_SAFE(id: string) {
  try {
    return getSpecies(id);
  } catch {
    return null;
  }
}

function actWater(s: GameState, role: Role, ctx: Ctx, now: number): void {
  const ch = s.characters[role];
  if (!ch.equip.tool?.startsWith('konewka')) {
    say(s, role, 'toast.no_can', undefined, 'bad');
    return;
  }
  if (ch.water <= 0) {
    say(s, role, 'toast.water_empty', undefined, 'bad');
    return;
  }
  const p = ctx.plant;
  if (!p || !p.needsWater) {
    say(s, role, 'toast.water_no', undefined, 'bad');
    return;
  }
  ch.water -= 1;
  p.needsWater = false;
  const cell = s.soil[soilKey(p.c, p.r)] ?? { tilled: true, wetUntil: 0 };
  cell.wetUntil = now + 22000;
  cell.tilled = true;
  s.soil[soilKey(p.c, p.r)] = cell;
  resume(s, p, now);
  onEvent(s, { type: 'water', n: 1 });
  grantXp(s, role, 3, now);
  if (p.needsPrune) say(s, role, 'toast.water_need_prune', undefined, 'water');
  else if (p.hybrid && p.stage === 'growing' && !p.fertilized) say(s, role, 'toast.hybrid_need_fert', undefined, 'water');
  else say(s, role, 'toast.water_f', undefined, 'water');
  noteTut(s, TUT.water);
  const pos = tileCenter(MAPS.ogrod, p.c, p.r);
  fx(s, 'ogrod', pos.x, pos.z, 'water');
  ch.cd.swing = now + 280;
}

function actRefill(s: GameState, role: Role, ctx: Ctx, _now: number): void {
  if (!ctx.nearWell) {
    say(s, role, 'toast.refill_no', undefined, 'bad');
    return;
  }
  const max = computeStats(s, role).waterMax;
  if (s.characters[role].water >= max) {
    say(s, role, 'toast.water_full', undefined, 'bad');
    return;
  }
  s.characters[role].water = max;
  noteTut(s, TUT.fill);
  say(s, role, 'toast.refill_f', undefined, 'water');
}

function actPrune(s: GameState, role: Role, ctx: Ctx, now: number): void {
  const p = ctx.plant;
  if (!p?.needsPrune) {
    say(s, role, 'toast.prune_no', undefined, 'bad');
    return;
  }
  p.needsPrune = false;
  if (!addItem(s.characters[role], 'kompost', 1)) say(s, role, 'toast.full_inv');
  resume(s, p, now);
  grantXp(s, role, 3, now);
  noteTut(s, TUT.prune);
  say(s, role, 'toast.prune_m', undefined, 'prune');
  s.characters[role].cd.swing = now + 280;
}

function actFert(s: GameState, role: Role, ctx: Ctx, now: number): void {
  const p = ctx.plant;
  if (!p || p.stage === 'mature' || p.fertilized) {
    say(s, role, 'toast.fert_no', undefined, 'bad');
    return;
  }
  if (countOne(s.characters[role], 'kompost') <= 0) {
    say(s, role, 'toast.no_compost', undefined, 'bad');
    return;
  }
  removeId(s.characters[role], 'kompost', 1);
  p.fertilized = true;
  noteTut(s, TUT.fert);
  p.quality = 2;
  if (p.readyAt && p.readyAt > now) p.readyAt = now + (p.readyAt - now) * 0.7;
  resume(s, p, now);
  grantXp(s, role, 3, now);
  say(s, role, 'toast.fert_f', undefined, 'fert');
}

function actHealPlant(s: GameState, role: Role, ctx: Ctx, now: number): void {
  const p = ctx.plant;
  if (!p?.needsHeal) {
    say(s, role, 'toast.healplant_no', undefined, 'bad');
    return;
  }
  p.needsHeal = false;
  resume(s, p, now);
  grantXp(s, role, 3, now);
  say(s, role, 'toast.healplant_f', undefined, 'heal');
  const pos = tileCenter(MAPS.ogrod, p.c, p.r);
  fx(s, 'ogrod', pos.x, pos.z, 'spark', undefined, '#9dffb0');
}

function actGather(s: GameState, role: Role, ctx: Ctx, now: number): void {
  if (role === 'ogrodnik') {
    const p = ctx.plant;
    if (!p || p.stage !== 'mature') {
      say(s, role, 'toast.harvest_no', undefined, 'bad');
      return;
    }
    const sp = getSpecies(p.species);
    const meta = cropMeta(s, p);
    if (!canAdd(s.characters[role], cropId(p.species), meta)) {
      say(s, role, 'toast.full_inv', undefined, 'bad');
      return;
    }
    addItem(s.characters[role], cropId(p.species), 1, meta);
    s.plants = s.plants.filter((x) => x.id !== p.id);
    onEvent(s, { type: 'harvest', n: 1, hybrid: sp.hybrid, greenhouse: meta?.includes('gh') ?? false });
    noteTut(s, TUT.harvest);
    grantXp(s, role, 6, now);
    say(s, role, 'toast.harvest_m', { name: itemName(cropId(p.species), meta) }, 'harvest');
    return;
  }
  const node = ctx.node;
  if (!node || (node.kind !== 'herb' && node.kind !== 'shroom')) {
    say(s, role, 'toast.gather_no', undefined, 'bad');
    return;
  }
  const id = node.kind === 'herb' ? 'ziele' : 'grzyb';
  if (!canAdd(s.characters[role], id)) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  node.left -= 1;
  if (node.left <= 0) node.respawn = now + 40000;
  addItem(s.characters[role], id, 1);
  noteTut(s, TUT.harvest);
  grantXp(s, role, 4, now);
  say(s, role, 'toast.gather_f', { name: itemName(id) }, 'pickup');
}

function cropMeta(s: GameState, p: Plant): string | undefined {
  const parts: string[] = [];
  if (p.hybrid) parts.push('hyb');
  if (s.buildings.greenhouse && tileChar(MAPS.ogrod, p.c, p.r) === 'G') parts.push('gh');
  if (p.fertilized || p.quality >= 2) parts.push('q2');
  return parts.length ? parts.join('_') : undefined;
}

function actCross(s: GameState, role: Role, now: number): void {
  const pair = crossPair(s, role);
  if (!pair) {
    say(s, role, 'toast.cross_no', undefined, 'bad');
    return;
  }
  const id = hybridSpecies(pair[0].species, pair[1].species);
  const sp = getSpecies(id);
  if (!canAdd(s.characters[role], seedId(id))) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  const ids = new Set(pair.map((p) => p.id));
  s.plants = s.plants.filter((p) => !ids.has(p.id));
  addItem(s.characters[role], seedId(id), 1);
  if (computeStats(s, role).crossBonus > 0 && hashStr(pair[0].id + pair[1].id) % 100 < 45) {
    addItem(s.characters[role], seedId(id), 1);
  }
  onEvent(s, { type: 'cross', n: 1 });
  noteTut(s, TUT.cross);
  grantXp(s, role, 10, now);
  say(s, role, 'toast.cross_f', { name: sp.name }, 'cross');
}

function crossPair(s: GameState, role: Role): [Plant, Plant] | null {
  const ch = s.characters[role];
  if (ch.map !== 'ogrod') return null;
  const near = s.plants.filter((p) => {
    const sp = SPECIES_SAFE(p.species);
    if (!sp || sp.kind !== 'kwiat' || p.stage !== 'mature') return false;
    const pos = tileCenter(MAPS.ogrod, p.c, p.r);
    return hypot(ch.x, ch.z, pos.x, pos.z) < 1.85;
  });
  let best: [Plant, Plant] | null = null;
  let bestD = 99;
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const d = Math.hypot(near[i].c - near[j].c, near[i].r - near[j].r);
      if (d <= 1.5 && d < bestD) {
        bestD = d;
        best = [near[i], near[j]];
      }
    }
  }
  return best;
}

function actChase(s: GameState, role: Role, now: number): void {
  const pests = pestsInRange(s, role);
  if (!pests.length) {
    say(s, role, 'toast.chase_no', undefined, 'bad');
    return;
  }
  for (const m of pests) {
    m.deadAt = now;
    m.hp = 0;
    onEvent(s, { type: 'chase', n: 1 });
    grantXp(s, role, MOBS[m.kind]?.xp ?? 5, now);
    fx(s, m.map, m.x, m.z, 'dust');
  }
  noteTut(s, TUT.pest);
  say(s, role, 'toast.chase_m', undefined, 'death');
  s.characters[role].cd.swing = now + 280;
}

function actBuild(s: GameState, role: Role, a: ActionMsg, now: number): void {
  const def = BUILDS.find((b) => b.id === a.build);
  const ch = s.characters[role];
  if (!def || ch.map !== 'ogrod') {
    say(s, role, 'toast.build_no', undefined, 'bad');
    return;
  }
  if (s.coins < def.cost) {
    say(s, role, 'toast.no_coins', undefined, 'bad');
    return;
  }
  const ctx = contextOf(s, role);
  if (def.id === 'fence') {
    if (!ctx.tile || ctx.tile.ch !== 'g' || tileBlocks(s, 'ogrod', ctx.tile.c, ctx.tile.r)) {
      say(s, role, 'toast.fence', undefined, 'bad');
      return;
    }
    if (s.fences.some((f) => f.c === ctx.tile!.c && f.r === ctx.tile!.r)) {
      say(s, role, 'toast.already', undefined, 'bad');
      return;
    }
    s.fences.push({ c: ctx.tile.c, r: ctx.tile.r });
  } else if (def.id === 'lampion') {
    if (!ctx.tile || (ctx.tile.ch !== 'g' && ctx.tile.ch !== 'p')) {
      say(s, role, 'toast.fence', undefined, 'bad');
      return;
    }
    s.decors.push({ id: 'lampion', c: ctx.tile.c, r: ctx.tile.r });
  } else if (def.id === 'greenhouse') {
    if (s.buildings.greenhouse) {
      say(s, role, 'toast.already', undefined, 'bad');
      return;
    }
    if (!nearChar(s, role, 'G', 3.3)) {
      say(s, role, 'toast.need_pad', undefined, 'bad');
      return;
    }
    s.buildings.greenhouse = true;
  } else if (def.id === 'coop') {
    if (s.buildings.coop) {
      say(s, role, 'toast.already', undefined, 'bad');
      return;
    }
    if (!nearChar(s, role, 'C', 2.2)) {
      say(s, role, 'toast.need_pad', undefined, 'bad');
      return;
    }
    s.buildings.coop = true;
    s.nextEgg = now + 20000;
  } else if (def.id === 'house') {
    if (!s.unlocks.includes('house')) {
      say(s, role, 'toast.house_locked', undefined, 'bad');
      return;
    }
    if (s.buildings.house) {
      say(s, role, 'toast.already', undefined, 'bad');
      return;
    }
    if (!nearChar(s, role, 'H', 3.2)) {
      say(s, role, 'toast.need_pad', undefined, 'bad');
      return;
    }
    s.buildings.house = true;
  }
  s.coins -= def.cost;
  onEvent(s, { type: 'build', build: def.id, n: 1 });
  grantXp(s, role, 8, now);
  say(s, role, 'toast.build_m', { name: t('build.' + def.id + '.name') }, 'build');
  refreshQuests(s);
}

function nearChar(s: GameState, role: Role, ch: string, dist: number): boolean {
  const p = s.characters[role];
  const map = MAPS.ogrod;
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (map.rows[r][c] !== ch) continue;
      const pos = tileCenter(map, c, r);
      if (hypot(p.x, p.z, pos.x, pos.z) <= dist) return true;
    }
  }
  return false;
}

function actAttack(
  s: GameState, role: Role, now: number, mul: number, radius: number, minDot: number,
  cdKey: string, cdMs: number, tag?: string,
): void {
  const ch = s.characters[role];
  if ((ch.cd[cdKey] ?? 0) > now) {
    say(s, role, 'toast.busy', undefined, 'bad');
    return;
  }
  ch.cd[cdKey] = now + cdMs;
  ch.cd.swing = now + 320;
  ch.sitting = false;
  const hits = strike(s, role, now, radius, minDot, mul, tag);
  if (!hits) say(s, role, 'toast.attack_none', undefined, 'bad');
  else fx(s, ch.map, ch.x + Math.sin(ch.rot) * 0.6, ch.z + Math.cos(ch.rot) * 0.6, 'hit');
}

function actDash(s: GameState, role: Role, now: number): void {
  const ch = s.characters[role];
  if ((ch.cd.szarza ?? 0) > now) {
    say(s, role, 'toast.busy', undefined, 'bad');
    return;
  }
  ch.cd.szarza = now + 6200;
  ch.cd.swing = now + 360;
  ch.sitting = false;
  ch.invulnUntil = now + 380;
  const step = 0.28;
  const dx = Math.sin(ch.rot);
  const dz = Math.cos(ch.rot);
  for (let i = 0; i < 6; i++) {
    const nx = ch.x + dx * step;
    const nz = ch.z + dz * step;
    if (circleBlocked(s, ch.map, nx, nz)) break;
    ch.x = nx;
    ch.z = nz;
  }
  ch.posLockUntil = now + 280;
  const hits = strike(s, role, now, 1.6, 0.0, 1.45, 'szarza');
  if (!hits) say(s, role, 'toast.attack_none');
  fx(s, ch.map, ch.x, ch.z, 'dust');
}

function strike(s: GameState, role: Role, now: number, radius: number, minDot: number, mul: number, tag?: string): number {
  const ch = s.characters[role];
  const st = computeStats(s, role);
  const foes = foesInCone(s, role, radius, minDot);
  let struck = false;
  for (const m of foes) {
    let dmg = Math.max(1, Math.round(st.attack * mul));
    if (tag === 'pylek' && (m.kind === 'osa' || m.kind === 'pszczola')) dmg += 10;
    if (tag === 'pylek') m.slowUntil = now + 2600;
    m.hp -= dmg;
    const def = MOBS[m.kind];
    if (def?.neutral) m.aggroUntil = now + 8000;
    fx(s, m.map, m.x, m.z + 0.4, 'dmg', String(dmg), '#fff4d0', 600);
    if (m.hp <= 0) killMob(s, m, role, now);
    else {
      if (!struck) sfxOnly(s, role, 'hit');
      struck = true;
      const dx = m.x - ch.x;
      const dz = m.z - ch.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = m.x + (dx / d) * 0.28;
      const nz = m.z + (dz / d) * 0.28;
      if (!circleBlocked(s, m.map, nx, nz, 0.18)) {
        m.x = nx;
        m.z = nz;
      }
    }
  }
  return foes.length;
}

function killMob(s: GameState, m: Mob, role: Role, now: number): void {
  m.hp = 0;
  m.deadAt = now;
  const xp = MOBS[m.kind]?.xp ?? 4;
  grantXp(s, role, xp, now);
  onEvent(s, { type: 'kill', kind: m.kind, n: 1 });
  if (MOBS[m.kind]?.pest) onEvent(s, { type: 'chase', n: 1 });
  const sp = s.spawners.find((x) => x.mobId === m.id);
  if (sp) sp.respawnAt = now + 26000;
  if (m.kind === 'szlam' && !m.split && s.mobs.filter((x) => x.map === m.map && !x.deadAt).length < 7) {
    for (const side of [-0.4, 0.4]) {
      const baby = makeMob('szlam_maly', m.map, m.x + side, m.z);
      baby.split = true;
      s.mobs.push(baby);
    }
  }
  fx(s, m.map, m.x, m.z, 'dust');
  sfxOnly(s, role, 'death');
}

function actHealHero(s: GameState, role: Role, now: number): void {
  const ch = s.characters[role];
  if ((ch.cd.uzdrow ?? 0) > now) {
    say(s, role, 'toast.busy', undefined, 'bad');
    return;
  }
  ch.cd.uzdrow = now + 8000;
  const partner = s.characters[otherRole(role)];
  const near = partner.map === ch.map && hypot(ch.x, ch.z, partner.x, partner.z) < 2.35;
  const before = partner.hp;
  const wasDown = partner.downed;
  const stP = computeStats(s, otherRole(role));
  if (near && partner.downed) {
    doRevive(s, otherRole(role), 0.6, now);
    onEvent(s, { type: 'revive', n: 1 });
    grantXp(s, role, 8, now);
    say(s, role, gkey(role, 'toast.revive'), undefined, 'heal');
  } else if (near && partner.hp < stP.maxHp) {
    partner.hp = Math.min(stP.maxHp, partner.hp + 36);
    fx(s, partner.map, partner.x, partner.z, 'spark', '+36', '#9dffb0');
  }
  const st = computeStats(s, role);
  ch.hp = Math.min(st.maxHp, ch.hp + 18);
  say(s, role, 'toast.use', { name: t('skill.zi_uzdrow.name') }, 'heal');
  fx(s, ch.map, ch.x, ch.z, 'spark', undefined, '#b8ffd0');
  if (near && (partner.hp > before || (wasDown && !partner.downed))) noteTut(s, TUT.heal);
}

function actRevive(s: GameState, role: Role, now: number): void {
  const ch = s.characters[role];
  const partner = s.characters[otherRole(role)];
  if (!(partner.downed && partner.map === ch.map && hypot(ch.x, ch.z, partner.x, partner.z) < 1.65)) {
    say(s, role, 'toast.revive_no', undefined, 'bad');
    return;
  }
  doRevive(s, otherRole(role), 0.48, now);
  onEvent(s, { type: 'revive', n: 1 });
  grantXp(s, role, 8, now);
  say(s, role, gkey(role, 'toast.revive'), undefined, 'heal');
}

function doRevive(s: GameState, role: Role, frac: number, now: number): void {
  const ch = s.characters[role];
  const st = computeStats(s, role);
  ch.downed = false;
  ch.hp = Math.max(8, Math.round(st.maxHp * frac));
  ch.invulnUntil = now + 1500;
  ch.posLockUntil = now + 300;
  ch.anim = 'idle';
  say(s, 'all', 'toast.revived', { name: t('role.' + role) }, 'heal');
  fx(s, ch.map, ch.x, ch.z, 'spark', undefined, '#fff1a8', 900);
}

function actMine(s: GameState, role: Role, ctx: Ctx, now: number): void {
  const node = ctx.node;
  if (!node || node.kind !== 'ore' || node.left <= 0) {
    say(s, role, 'toast.mine_no', undefined, 'bad');
    return;
  }
  if (!canAdd(s.characters[role], 'ruda')) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  node.left -= 1;
  if (node.left <= 0) node.respawn = now + 45000;
  addItem(s.characters[role], 'ruda', 1);
  if (hashStr(node.key + String(now % 10)) % 5 === 0) hurt(s, role, 5, now, 'env');
  grantXp(s, role, 4, now);
  say(s, role, 'toast.mine_m', undefined, 'dig');
  s.characters[role].cd.swing = now + 280;
}

function actEggs(s: GameState, role: Role, ctx: Ctx, _now: number): void {
  if (!ctx.nearCoop || s.eggs <= 0) {
    say(s, role, 'toast.egg_no', undefined, 'bad');
    return;
  }
  let moved = 0;
  while (s.eggs > 0 && canAdd(s.characters[role], 'jajko')) {
    addItem(s.characters[role], 'jajko', 1);
    s.eggs -= 1;
    moved += 1;
  }
  if (!moved) say(s, role, 'toast.full_inv', undefined, 'bad');
  else say(s, role, 'toast.egg', { n: moved }, 'pickup');
}

function actSit(s: GameState, role: Role, now: number): void {
  const ch = s.characters[role];
  if (ch.sitting) {
    ch.sitting = false;
    ch.anim = 'idle';
    say(s, role, 'toast.stand');
    return;
  }
  if (!s.buildings.house || ch.map !== 'ogrod') {
    say(s, role, 'reason.bench', undefined, 'bad');
    return;
  }
  const seat = tileCenter(MAPS.ogrod, role === 'ogrodnik' ? 2 : 3, 9);
  if (hypot(ch.x, ch.z, seat.x, seat.z) > 1.55) {
    say(s, role, 'toast.far', undefined, 'bad');
    return;
  }
  ch.x = seat.x;
  ch.z = seat.z + 0.05;
  ch.rot = 0;
  ch.sitting = true;
  ch.anim = 'sit';
  ch.posLockUntil = now + 250;
  say(s, role, gkey(role, 'toast.sit'), undefined, 'ui');
}

function actStake(s: GameState, role: Role, ctx: Ctx, _now: number): void {
  if (s.weather.kind === 'clear') {
    say(s, role, 'toast.secure_no', undefined, 'bad');
    return;
  }
  if (s.buildings.greenhouse && ctx.nearGh) {
    s.weather.secured = true;
    say(s, role, 'toast.secured_m', undefined, 'build');
    return;
  }
  if (ctx.plant) {
    ctx.plant.staked = true;
    say(s, role, 'toast.staked_m', undefined, 'dig');
    return;
  }
  say(s, role, 'toast.secure_no', undefined, 'bad');
}

function actCover(s: GameState, role: Role, ctx: Ctx, _now: number): void {
  if (!ctx.plant || s.weather.kind === 'clear') {
    say(s, role, 'toast.secure_no', undefined, 'bad');
    return;
  }
  ctx.plant.covered = true;
  say(s, role, 'toast.cover_f', undefined, 'magic');
}

function actUse(s: GameState, role: Role, id: string, now: number): void {
  const it = ITEMS[id];
  const ch = s.characters[role];
  if (!it?.heal || countOne(ch, id) <= 0) {
    say(s, role, 'toast.use_no', undefined, 'bad');
    return;
  }
  const st = computeStats(s, role);
  const partner = s.characters[otherRole(role)];
  const pst = computeStats(s, otherRole(role));
  const nearHurt = partner.map === ch.map && hypot(ch.x, ch.z, partner.x, partner.z) < 2.2 && partner.hp < pst.maxHp;
  const selfFull = ch.hp >= st.maxHp && !(it.clearSlow && ch.slowUntil > now);
  if (selfFull && !(id === 'bandaz' && nearHurt)) {
    say(s, role, 'toast.use_no', undefined, 'bad');
    return;
  }
  removeId(ch, id, 1);
  if (!selfFull) ch.hp = Math.min(st.maxHp, ch.hp + it.heal);
  if (id === 'bandaz' && nearHurt) {
    partner.hp = Math.min(pst.maxHp, partner.hp + Math.ceil(it.heal / 2));
    noteTut(s, TUT.heal);
    fx(s, partner.map, partner.x, partner.z, 'spark', '+' + Math.ceil(it.heal / 2), '#9dffb0');
  }
  if (it.clearSlow) ch.slowUntil = 0;
  if (id === 'miod') {
    ch.buffDef = 3;
    ch.buffDefUntil = now + 8000;
  }
  say(s, role, 'toast.use', { name: it.name }, 'pickup');
  fx(s, ch.map, ch.x, ch.z, 'spark', '+' + it.heal, '#c9ffd4');
}

function actTalk(s: GameState, role: Role, npcId: string, _now: number): void {
  const npc = NPCS.find((n) => n.id === npcId);
  const ch = s.characters[role];
  if (!npc || npc.map !== ch.map) {
    say(s, role, 'toast.talk_none', undefined, 'bad');
    return;
  }
  const p = tileCenter(MAPS[npc.map], npc.c, npc.r);
  if (hypot(ch.x, ch.z, p.x, p.z) > 1.85) {
    say(s, role, 'toast.far', undefined, 'bad');
    return;
  }
  onEvent(s, { type: 'talk', npc: npcId, n: 1 });
  if (npcId === 'stanislaw') noteTut(s, TUT.quest);
}

function actEmote(s: GameState, role: Role, now: number): void {
  const ch = s.characters[role];
  const cycle = ['heart', 'wave', 'laugh', 'flower'];
  const cur = cycle.indexOf(ch.emote);
  ch.emote = ch.emoteUntil > now && cur >= 0 ? cycle[(cur + 1) % cycle.length] : 'heart';
  ch.emoteUntil = now + 2600;
  fx(s, ch.map, ch.x, ch.z + 1.1, 'heart');
}

function isSlot(slot: string): slot is EquipSlot {
  return slot === 'hat' || slot === 'gloves' || slot === 'boots' || slot === 'tool';
}

function actEquip(s: GameState, role: Role, id: string): void {
  const it = ITEMS[id];
  const ch = s.characters[role];
  if (!it?.slot || countOne(ch, id) <= 0) return;
  if (it.roles && !it.roles.includes(role)) {
    say(s, role, 'toast.role_item', undefined, 'bad');
    return;
  }
  const prev = ch.equip[it.slot];
  if (prev && !canAdd(ch, prev)) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  removeId(ch, id, 1);
  if (prev) addItem(ch, prev, 1);
  ch.equip[it.slot] = id;
  const st = computeStats(s, role);
  if (ch.hp > st.maxHp) ch.hp = st.maxHp;
  if (ch.water > st.waterMax) ch.water = st.waterMax;
  say(s, role, 'toast.equip', { name: it.name }, 'ui');
}

function actUnequip(s: GameState, role: Role, slot: string): void {
  const ch = s.characters[role];
  if (!isSlot(slot)) return;
  const id = ch.equip[slot];
  if (!id) return;
  if (!canAdd(ch, id)) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  addItem(ch, id, 1);
  delete ch.equip[slot];
  const st = computeStats(s, role);
  if (ch.hp > st.maxHp) ch.hp = st.maxHp;
  say(s, role, 'toast.unequip', { name: itemName(id) }, 'ui');
}

function actGive(s: GameState, role: Role, a: ActionMsg, _now: number): void {
  const ch = s.characters[role];
  const partner = s.characters[otherRole(role)];
  if (partner.map !== ch.map || hypot(ch.x, ch.z, partner.x, partner.z) > 2.3) {
    say(s, role, 'toast.give_no', undefined, 'bad');
    return;
  }
  const id = a.item ?? '';
  const meta = a.meta;
  const qty = Math.max(1, a.qty ?? 1);
  const have = ch.inv.find((st) => st.id === id && (st.meta ?? '') === (meta ?? ''));
  if (!have) return;
  const n = Math.min(qty, have.n);
  if (!canAdd(partner, id, meta)) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  removeId(ch, id, n, meta ?? '');
  addItem(partner, id, n, meta);
  say(s, role, 'toast.give', { name: itemName(id, meta) }, 'ui');
}

function actSkill(s: GameState, role: Role, id: string): void {
  const sk = SKILLS.find((x) => x.id === id);
  const ch = s.characters[role];
  if (!sk || sk.role !== role || ch.skills.includes(id)) {
    say(s, role, 'toast.skill_no', undefined, 'bad');
    return;
  }
  if (ch.skillPoints <= 0 || ch.level < sk.needLevel || sk.requires.some((r) => !ch.skills.includes(r))) {
    say(s, role, 'toast.skill_no', undefined, 'bad');
    return;
  }
  ch.skillPoints -= 1;
  ch.skills.push(id);
  say(s, 'all', 'toast.skill', { name: sk.name }, 'magic');
  if (sk.active) say(s, role, 'toast.skill_active', { name: t('action.' + sk.active) });
}

export function shopVisible(s: GameState, id: string): boolean {
  const it = ITEMS[id];
  if (!it || it.buy <= 0) return false;
  if (it.shop) return true;
  return s.unlocks.includes(id);
}

function actBuy(s: GameState, role: Role, id: string): void {
  const it = ITEMS[id];
  if (!it || !shopVisible(s, id)) {
    say(s, role, 'toast.need_unlock', undefined, 'bad');
    return;
  }
  if (s.coins < it.buy) {
    say(s, role, 'toast.no_coins', undefined, 'bad');
    return;
  }
  if (!canAdd(s.characters[role], id)) {
    say(s, role, 'toast.full_inv', undefined, 'bad');
    return;
  }
  s.coins -= it.buy;
  addItem(s.characters[role], id, 1);
  say(s, role, 'toast.buy', { name: it.name }, 'coin');
}

function actSell(s: GameState, role: Role, a: ActionMsg, now: number): void {
  const id = a.item ?? '';
  const it = ITEMS[id];
  const ch = s.characters[role];
  if (!it || it.sell <= 0) return;
  const meta = a.meta;
  const stack = ch.inv.find((st) => st.id === id && (st.meta ?? '') === (meta ?? ''));
  if (!stack) return;
  const qty = Math.min(stack.n, Math.max(1, a.qty ?? 1));
  removeId(ch, id, qty, meta ?? '');
  let gain = it.sell * qty;
  if (meta?.includes('q2')) gain *= 1.5;
  if (meta?.includes('hyb')) gain *= 1.15;
  const coins = Math.round(gain);
  s.coins += coins;
  if (it.kind === 'crop') onEvent(s, { type: 'sell', n: qty });
  grantXp(s, role, it.kind === 'crop' ? 2 : 0, now);
  say(s, role, 'toast.sell', { n: coins }, 'coin');
}

function actOrder(s: GameState, role: Role, id: string, now: number): void {
  const order = ORDERS.find((o) => o.id === id);
  if (!order || !s.orders.includes(id)) return;
  for (const need of order.need) {
    if (need.hybridGh) {
      if (countHybridGh(s) < need.n) {
        say(s, role, 'toast.order_no', undefined, 'bad');
        return;
      }
    } else if (countBoth(s, need.id) < need.n) {
      say(s, role, 'toast.order_no', undefined, 'bad');
      return;
    }
  }
  for (const need of order.need) {
    if (need.hybridGh) takeBoth(s, 'hybrid_gh', need.n, role);
    else takeBoth(s, need.id, need.n, role);
  }
  s.coins += order.coins;
  grantXp(s, role, order.xp, now);
  s.flags.ordersDone = (s.flags.ordersDone ?? 0) + 1;
  say(s, 'all', 'toast.order', { n: order.coins }, 'coin');
}

function actAccept(s: GameState, _role: Role, id: string): void {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.status !== 'available') return;
  q.status = 'active';
  noteTut(s, TUT.quest);
  say(s, 'all', 'toast.quest_in', { name: t('quest.' + id + '.title') }, 'quest');
}

function actTurnin(s: GameState, role: Role, id: string, now: number): void {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.status !== 'active' || !isReady(s, q)) {
    say(s, role, 'toast.quest_no', undefined, 'bad');
    return;
  }
  const def = questDef(id);
  for (const o of def.objectives) {
    if (o.type === 'give' && o.item) {
      if (!takeBoth(s, o.item, o.n, role)) {
        say(s, role, 'toast.quest_no', undefined, 'bad');
        return;
      }
    }
  }
  q.status = 'done';
  if (def.rewards.coins) s.coins += def.rewards.coins;
  if (def.rewards.xp) {
    grantXp(s, 'ogrodnik', def.coop ? def.rewards.xp : role === 'ogrodnik' ? def.rewards.xp : Math.ceil(def.rewards.xp / 2), now);
    grantXp(s, 'zielarka', def.coop ? def.rewards.xp : role === 'zielarka' ? def.rewards.xp : Math.ceil(def.rewards.xp / 2), now);
  }
  for (const it of def.rewards.items ?? []) {
    const target = preferRoleFor(it.id, role);
    if (!addItem(s.characters[target], it.id, it.n)) addItem(s.characters[otherRole(target)], it.id, it.n);
  }
  for (const u of def.rewards.unlocks ?? []) {
    if (!s.unlocks.includes(u)) s.unlocks.push(u);
  }
  refreshQuests(s);
  say(s, 'all', 'toast.quest_done', { name: def.title }, 'questdone');
}

function preferRoleFor(id: string, turner: Role): Role {
  const it = ITEMS[id];
  if (it?.roles?.length === 1) return it.roles[0];
  if (id.startsWith('seed_') || id === 'kompost') return id === 'kompost' ? 'zielarka' : 'ogrodnik';
  return turner;
}

function place(s: GameState, role: Role, mapId: MapId, from: MapId, now: number): void {
  const map = MAPS[mapId];
  const spot = map.arrival[from] ?? map.arrival.default ?? { c: 1, r: 1, rot: Math.PI };
  const p = tileCenter(map, spot.c, spot.r);
  const ch = s.characters[role];
  ch.map = mapId;
  ch.x = p.x + (role === 'ogrodnik' ? -0.18 : 0.18);
  ch.z = p.z;
  ch.rot = spot.rot;
  ch.sitting = false;
  noteTut(s, TUT.travel + role);
  ch.posLockUntil = now + 500;
  ch.anim = 'idle';
  ensureMap(s, mapId);
}

function actTravel(s: GameState, role: Role, map: MapId | undefined, call: boolean, now: number): void {
  if (!map || map === s.characters[role].map) return;
  const from = s.characters[role].map;
  place(s, role, map, from, now);
  say(s, role, 'toast.travel', { name: t('map.' + map) }, 'ui');
  if (call) {
    s.invite = { from: role, map, until: now + 20000 };
    say(s, otherRole(role), 'toast.invite');
  }
}

function actAcceptInvite(s: GameState, role: Role, now: number): void {
  if (!s.invite || s.invite.from === role || s.invite.until < now) {
    s.invite = null;
    return;
  }
  const dest = s.invite.map;
  const from = s.characters[role].map;
  s.invite = null;
  place(s, role, dest, from, now);
  say(s, role, 'toast.travel', { name: t('map.' + dest) }, 'ui');
}

function resume(s: GameState, p: Plant, now: number): void {
  if (p.stage === 'mature') {
    p.readyAt = null;
    return;
  }
  if (p.needsWater || p.needsPrune || p.needsHeal) {
    p.readyAt = null;
    return;
  }
  if (p.hybrid && p.stage === 'growing' && !p.fertilized) {
    p.readyAt = null;
    return;
  }
  if (p.readyAt == null) p.readyAt = now + stageMs(s, p);
}

function stageMs(s: GameState, p: Plant): number {
  const sp = getSpecies(p.species);
  const idx = p.stage === 'seed' ? 0 : p.stage === 'sprout' ? 1 : 2;
  let ms = sp.grow[idx];
  if (p.fertilized && p.stage === 'growing') ms *= 0.62;
  if (p.plantedBy === 'ogrodnik') ms *= 1 - Math.min(0.45, computeStats(s, 'ogrodnik').growBonus);
  return ms;
}

function advancePlants(s: GameState, now: number): void {
  for (const p of s.plants) {
    if ((p.stage === 'sprout' || p.stage === 'growing') && p.needsWater && !p.needsHeal && now - p.since > 36000) {
      p.needsHeal = true;
      p.readyAt = null;
    }
    if (p.needsWater || p.needsPrune || p.needsHeal) continue;
    if (p.hybrid && p.stage === 'growing' && !p.fertilized) continue;
    if (p.readyAt == null || now < p.readyAt) continue;
    const order: Plant['stage'][] = ['seed', 'sprout', 'growing', 'mature'];
    const i = order.indexOf(p.stage);
    if (i < 0 || i >= order.length - 1) continue;
    p.stage = order[i + 1];
    p.since = now;
    p.needsPrune = false;
    if (p.stage === 'mature') {
      p.needsWater = false;
      p.readyAt = null;
      const pos = tileCenter(MAPS.ogrod, p.c, p.r);
      fx(s, 'ogrod', pos.x, pos.z + 0.4, 'spark', undefined, '#ffe27a', 1000);
    } else {
      p.needsWater = true;
      p.readyAt = null;
      if (p.stage === 'sprout' && hashStr(p.id) % 100 < 40) p.needsPrune = true;
    }
  }
}

function hurt(s: GameState, role: Role, amount: number, now: number, source: string): void {
  const ch = s.characters[role];
  if (!s.connected[role] || ch.downed || ch.invulnUntil > now) return;
  const st = computeStats(s, role);
  const def = st.defense + (ch.buffDefUntil > now ? ch.buffDef : 0);
  let dmg = Math.max(1, Math.round(amount * (100 / (100 + def))));
  if (source === 'lightning') dmg = Math.max(1, Math.round(dmg * (1 - st.stormResist)));
  ch.hp -= dmg;
  ch.invulnUntil = now + 680;
  ch.posLockUntil = now + 220;
  fx(s, ch.map, ch.x, ch.z + 0.8, 'dmg', String(dmg), '#ff5b6a', 650);
  let noted = false;
  if (source === 'bee' && (ch.cd.beeNote ?? 0) < now) {
    ch.cd.beeNote = now + 2600;
    ch.slowUntil = now + 2200;
    say(s, role, 'toast.bees', undefined, 'hurt');
    noted = true;
  } else if (source === 'lightning') {
    say(s, role, 'toast.lightning', undefined, 'hurt');
    noted = true;
  } else if (source === 'mob') {
    ch.slowUntil = Math.max(ch.slowUntil, now + (amount > 10 ? 500 : 0));
  }
  if (ch.hp <= 0) {
    ch.hp = 0;
    ch.downed = true;
    ch.downedAt = now;
    ch.sitting = false;
    ch.anim = 'down';
    say(s, 'all', 'toast.down', { name: t('role.' + role) }, 'hurt');
  } else if (!noted) sfxOnly(s, role, 'hurt');
}

export function simulate(s: GameState, now: number, dt: number): void {
  if (now - s.lastTick > 3000) {
    catchUp(s, now);
    return;
  }
  s.lastTick = now;
  advancePlants(s, now);
  stepWorld(s, now, Math.min(0.05, dt));
  s.fx = s.fx.filter((f) => f.until > now);
  s.notices = s.notices.filter((n) => n.until > now);
  if (s.invite && s.invite.until < now) s.invite = null;
  for (const role of ROLES) {
    const ch = s.characters[role];
    if (ch.emoteUntil < now) ch.emote = '';
    const st = computeStats(s, role);
    if (ch.hp > st.maxHp) ch.hp = st.maxHp;
    if (ch.water > st.waterMax) ch.water = st.waterMax;
  }
  refreshQuests(s);
  const burza = s.quests.find((q) => q.id === 'burza' && q.status === 'active');
  if (burza && !isReady(s, burza) && !s.flags.stormQueued && s.weather.kind === 'clear' && someone(s, 'ogrod')) {
    s.flags.stormQueued = 1;
    s.weather.nextAt = Math.min(s.weather.nextAt, now + 9000);
  }
  if (!s.flags.pestQuest) {
    const q = s.quests.find((x) => x.id === 'szkodniki' && x.status === 'active');
    if (q) {
      s.flags.pestQuest = 1;
      spawnPest(s, 'slimak');
      spawnPest(s, 'kret');
    }
  }
}

function someone(s: GameState, map: MapId): boolean {
  return ROLES.some((r) => s.connected[r] && s.characters[r].map === map);
}

function stepWorld(s: GameState, now: number, dt: number): void {
  const active = new Set<MapId>();
  for (const role of ROLES) if (s.connected[role]) active.add(s.characters[role].map);

  for (const sp of s.spawners) {
    if (!active.has(sp.map)) continue;
    const alive = s.mobs.find((m) => m.id === sp.mobId && !m.deadAt);
    if (!alive && now >= sp.respawnAt) {
      const mob = makeMob(sp.kind, sp.map, sp.x, sp.z);
      s.mobs.push(mob);
      sp.mobId = mob.id;
    }
  }

  if (active.has('ogrod') && s.plants.length && now >= s.nextPest && s.mobs.filter((m) => m.map === 'ogrod' && !m.deadAt && MOBS[m.kind]?.pest).length < 2) {
    const kinds = ['slimak', 'kret', 'wrona'];
    spawnPest(s, kinds[Math.floor(Math.random() * kinds.length)]);
    s.nextPest = now + 26000 + Math.floor(Math.random() * 18000);
    say(s, 'all', 'toast.pest_in', undefined, 'bad');
  }

  for (const m of s.mobs) {
    if (m.deadAt || !active.has(m.map)) continue;
    const def = MOBS[m.kind];
    if (!def) continue;
    if (def.pest) stepPest(s, m, dt, now);
    else stepHostile(s, m, def, dt, now);
  }
  s.mobs = s.mobs.filter((m) => !m.deadAt || now - m.deadAt < 900);

  for (const n of s.nodes) {
    if (n.left <= 0 && n.respawn > 0 && now >= n.respawn) n.left = n.kind === 'ore' ? 3 : 2;
  }

  if (s.buildings.coop && s.nextEgg > 0 && now >= s.nextEgg && s.eggs < 4) {
    s.eggs += 1;
    s.nextEgg = now + 35000;
  }

  stepWeather(s, now, dt);
  for (const role of ROLES) {
    if (!s.connected[role]) continue;
    const ch = s.characters[role];
    if ((ch.cd.hazard ?? 0) > now) continue;
    ch.cd.hazard = now + 700;
    const under = worldToTile(MAPS[ch.map], ch.x, ch.z);
    if (under?.ch === 'n') hurt(s, role, 5, now, 'env');
    if (under?.ch === 'd') hurt(s, role, 8, now, 'env');
    if (ch.map === 'laka' && nearHive(ch.x, ch.z)) {
      for (const m of s.mobs) if (m.kind === 'pszczola' && m.map === 'laka' && !m.deadAt) m.aggroUntil = now + 7000;
      hurt(s, role, 7, now, 'bee');
    }
    if (ch.downed) {
      const partner = otherRole(role);
      const gone = !s.connected[partner];
      const both = s.characters[partner].downed;
      const limit = gone || both ? 8000 : 20000;
      if (now - ch.downedAt > limit) {
        if (both) {
          place(s, role, ch.map, ch.map, now);
          place(s, partner, s.characters[partner].map, s.characters[partner].map, now);
          say(s, 'all', 'toast.both_down');
        }
        doRevive(s, role, 0.35, now);
        if (!both) say(s, role, gkey(role, 'toast.selfget'));
      }
    }
  }

  if (s.buildings.house) {
    const A = s.characters.ogrodnik;
    const B = s.characters.zielarka;
    if (A.sitting && B.sitting && A.map === B.map && hypot(A.x, A.z, B.x, B.z) < 2.2) onEvent(s, { type: 'sit_together', n: 1 });
  }
  for (const map of ['ogrod', 'wies', 'las', 'laka', 'jaskinia'] as MapId[]) {
    if (s.connected.ogrodnik && s.connected.zielarka && s.characters.ogrodnik.map === map && s.characters.zielarka.map === map) {
      onEvent(s, { type: 'both_on', map, n: 1 });
    }
  }
}

function nearHive(x: number, z: number): boolean {
  const map = MAPS.laka;
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (map.rows[r][c] !== 'h') continue;
      const p = tileCenter(map, c, r);
      if (hypot(x, z, p.x, p.z) < 1.2) return true;
    }
  }
  return false;
}

function spawnPest(s: GameState, kind: string): void {
  const map = MAPS.ogrod;
  const spots: { c: number; r: number }[] = [];
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      const ch = map.rows[r][c];
      if (ch === 'g' || ch === 'p') spots.push({ c, r });
    }
  }
  if (!spots.length) return;
  const spot = spots[Math.floor(Math.random() * spots.length)];
  const p = tileCenter(map, spot.c, spot.r);
  s.mobs.push(makeMob(kind, 'ogrod', p.x, p.z));
}

function stepPest(s: GameState, m: Mob, dt: number, now: number): void {
  if (!s.plants.length) {
    m.deadAt = now;
    return;
  }
  const prefer = m.kind === 'wrona';
  let target: Plant | null = null;
  let best = 1e9;
  const mature = s.plants.some((p) => p.stage === 'mature');
  for (const p of s.plants) {
    if (prefer && mature && p.stage !== 'mature') continue;
    const pos = tileCenter(MAPS.ogrod, p.c, p.r);
    const d = hypot(m.x, m.z, pos.x, pos.z);
    if (d < best) {
      best = d;
      target = p;
    }
  }
  if (!target) return;
  const pos = tileCenter(MAPS.ogrod, target.c, target.r);
  const dx = pos.x - m.x;
  const dz = pos.z - m.z;
  const d = Math.hypot(dx, dz) || 1;
  const speed = MOBS[m.kind].speed * (m.slowUntil > now ? 0.55 : 1);
  if (d > 0.48) mobStep(s, m, (dx / d) * speed * dt, (dz / d) * speed * dt);
  else {
    m.peck += dt;
    if (m.peck > 1.5) {
      m.peck = 0;
      target.needsHeal = true;
      target.readyAt = null;
      if (target.stage === 'mature' && m.kind === 'wrona') target.stage = 'growing';
      fx(s, 'ogrod', pos.x, pos.z, 'dmg', '!', '#ff8a6a');
    }
  }
}

function stepHostile(s: GameState, m: Mob, def: (typeof MOBS)[string], dt: number, now: number): void {
  const players = ROLES.filter((r) => s.connected[r] && !s.characters[r].downed && s.characters[r].map === m.map);
  let target: Role | null = null;
  let best = def.aggro;
  if (def.neutral && m.aggroUntil < now) best = 0;
  for (const r of players) {
    const ch = s.characters[r];
    const d = hypot(m.x, m.z, ch.x, ch.z);
    const reach = def.neutral && m.aggroUntil < now ? 0 : def.aggro;
    if (d < reach && d < best) {
      best = d;
      target = r;
    }
  }
  if (m.chargeLeft > 0) {
    m.chargeLeft -= dt;
    mobStep(s, m, m.vx * dt, m.vz * dt);
    for (const r of players) {
      const ch = s.characters[r];
      if (hypot(m.x, m.z, ch.x, ch.z) < 0.78 && m.cd <= 0) {
        m.cd = 1.3;
        hurt(s, r, def.dmg + 4, now, 'mob');
        ch.x += m.vx * 0.12;
        ch.z += m.vz * 0.12;
      }
    }
    return;
  }
  if (!target) {
    m.wander -= dt;
    if (m.wander <= 0) {
      const ang = Math.random() * Math.PI * 2;
      m.vx = Math.sin(ang) * 0.45;
      m.vz = Math.cos(ang) * 0.45;
      m.wander = 1.2 + Math.random();
    }
    mobStep(s, m, m.vx * dt, m.vz * dt);
    if (hypot(m.x, m.z, m.homeX, m.homeZ) > 4.5) {
      m.vx = m.homeX - m.x;
      m.vz = m.homeZ - m.z;
    }
    return;
  }
  const ch = s.characters[target];
  const dx = ch.x - m.x;
  const dz = ch.z - m.z;
  const d = Math.hypot(dx, dz) || 1;
  m.cd -= dt;
  if (def.charge && m.cd <= 0 && d > 1.35 && d < 5) {
    m.vx = (dx / d) * 3.3;
    m.vz = (dz / d) * 3.3;
    m.chargeLeft = 0.55;
    m.cd = 2.4;
    fx(s, m.map, m.x, m.z, 'dust');
    return;
  }
  const speed = def.speed * (m.slowUntil > now ? 0.55 : 1);
  if (d > 0.78) mobStep(s, m, (dx / d) * speed * dt, (dz / d) * speed * dt);
  else if (m.cd <= 0) {
    m.cd = 1.15;
    hurt(s, target, def.dmg, now, 'mob');
  }
}

function mobStep(s: GameState, m: Mob, dx: number, dz: number): void {
  if (!circleBlocked(s, m.map, m.x + dx, m.z, 0.18)) m.x += dx;
  if (!circleBlocked(s, m.map, m.x, m.z + dz, 0.18)) m.z += dz;
  if (Math.abs(dx) + Math.abs(dz) > 0.0001) m.rot = Math.atan2(dx, dz);
}

function stepWeather(s: GameState, now: number, _dt: number): void {
  const w = s.weather;
  if ((w.kind === 'warning' || w.kind === 'storm') && someone(s, 'ogrod')) w.seenGarden = true;
  if (w.kind === 'clear' && now >= w.nextAt && someone(s, 'ogrod')) {
    w.kind = 'warning';
    w.until = now + 12000;
    w.secured = false;
    w.seenGarden = true;
    w.protected = 0;
    for (const p of s.plants) {
      p.staked = false;
      p.covered = false;
    }
    say(s, 'all', 'toast.storm_warn', undefined, 'bad');
  } else if (w.kind === 'warning' && now >= w.until) {
    w.kind = 'storm';
    w.until = now + 10000;
    s.flags.lightningAt = now + 1200;
    say(s, 'all', 'toast.storm_on', undefined, 'hurt');
  } else if (w.kind === 'storm') {
    if (now >= (s.flags.lightningAt ?? 0)) {
      s.flags.lightningAt = now + 2600;
      const targets = ROLES.filter((r) => s.connected[r] && s.characters[r].map === 'ogrod');
      if (targets.length && Math.random() < 0.75) {
        const r = targets[Math.floor(Math.random() * targets.length)];
        const ch = s.characters[r];
        const safe = w.secured && inGh(s, ch.x, ch.z);
        fx(s, 'ogrod', ch.x, ch.z, 'lightning', undefined, '#fff6c8', 420);
        if (!safe) hurt(s, r, 14, now, 'lightning');
      } else if (s.plants.length) {
        const p = s.plants[Math.floor(Math.random() * s.plants.length)];
        const safe = (w.secured && tileChar(MAPS.ogrod, p.c, p.r) === 'G' && s.buildings.greenhouse) || p.staked || p.covered;
        if (!safe) {
          p.needsHeal = true;
          p.readyAt = null;
          const pos = tileCenter(MAPS.ogrod, p.c, p.r);
          fx(s, 'ogrod', pos.x, pos.z, 'lightning');
        }
      }
    }
    if (now >= w.until) {
      let protectedN = 0;
      for (const p of s.plants) {
        const safe = (s.buildings.greenhouse && w.secured && tileChar(MAPS.ogrod, p.c, p.r) === 'G') || p.staked || p.covered;
        if (safe) protectedN += 1;
        else {
          p.needsHeal = true;
          p.readyAt = null;
          if (p.stage === 'mature') p.stage = 'growing';
        }
        p.staked = false;
        p.covered = false;
      }
      w.protected = protectedN;
      w.kind = 'clear';
      w.secured = false;
      const burzaOpen = s.quests.some((q) => q.id === 'burza' && q.status === 'active' && !isReady(s, q));
      w.nextAt = now + (burzaOpen ? 32000 : 85000);
      if (protectedN > 0 || s.plants.length === 0) onEvent(s, { type: 'storm', n: 1 });
      say(s, 'all', 'toast.storm_end', { n: protectedN }, 'ok');
    }
  }
}

function inGh(s: GameState, x: number, z: number): boolean {
  if (!s.buildings.greenhouse) return false;
  const t = worldToTile(MAPS.ogrod, x, z);
  return !!t && t.ch === 'G';
}

export interface DialogButton {
  label: string;
  action: ActionMsg | null;
}
export interface DialogView {
  npcId: string;
  name: string;
  title: string;
  lines: string[];
  buttons: DialogButton[];
}

export function previewDialog(s: GameState, role: Role, npcId: string, now: number): DialogView {
  const key = dialogKey(s, npcId);
  const copy = structuredClone(s);
  const ch = s.characters[role];
  applyAction(copy, role, { id: 'talk', npc: npcId, x: ch.x, z: ch.z, rot: ch.rot }, now);
  return dialogFrom(copy, role, npcId, key);
}

function dialogKey(s: GameState, npcId: string): string {
  if (s.quests.some((q) => q.status === 'active' && questDef(q.id).npc === npcId && isReady(s, q))) return npcId + '.turnin';
  const active = s.quests.find((q) => q.status === 'active' && questDef(q.id).npc === npcId);
  if (active) {
    const def = questDef(active.id);
    const needsTalk = def.objectives.some((o, i) => o.type === 'talk' && o.npc === npcId && (active.progress['o' + i] ?? 0) < o.n);
    return needsTalk ? npcId + '.hello' : npcId + '.busy';
  }
  if (s.quests.some((q) => q.status === 'available' && questDef(q.id).npc === npcId)) return npcId + '.offer';
  return npcId + '.hello';
}

function dialogFrom(s: GameState, role: Role, npcId: string, key: string): DialogView {
  const ch = s.characters[role];
  const buttons: DialogButton[] = [];
  const base = { x: ch.x, z: ch.z, rot: ch.rot };
  const ready = s.quests.find((q) => q.status === 'active' && questDef(q.id).npc === npcId && isReady(s, q));
  if (ready) buttons.push({ label: t('dlg.turn'), action: { ...base, id: 'quest_turnin', quest: ready.id } });
  const avail = s.quests.find((q) => q.status === 'available' && questDef(q.id).npc === npcId);
  if (avail && !ready) buttons.push({ label: t('dlg.accept'), action: { ...base, id: 'quest_accept', quest: avail.id } });
  if (npcId === 'henio') buttons.push({ label: t('dlg.shop'), action: { ...base, id: 'open_shop' } });
  buttons.push({ label: t('dlg.close'), action: null });
  const lines = linesOf(key);
  if (!lines.length && LINES[npcId + '.hello']) return dialogFrom(s, role, npcId, npcId + '.hello');
  return {
    npcId,
    name: t('npc.' + npcId + '.name'),
    title: t('npc.' + npcId + '.title'),
    lines: lines.length ? lines : [t('npc.' + npcId + '.name')],
    buttons,
  };
}

export function seedChoices(s: GameState, role: Role): { id: string; name: string; n: number }[] {
  const out: { id: string; name: string; n: number }[] = [];
  for (const st of s.characters[role].inv) {
    if (!st.id.startsWith('seed_') || st.n <= 0) continue;
    const species = st.id.slice(5);
    out.push({ id: species, name: itemName(st.id), n: st.n });
  }
  return out;
}

export function orderRows(s: GameState): { id: string; title: string; desc: string; have: string; ok: boolean; coins: number }[] {
  return s.orders.map((id) => {
    const o = ORDERS.find((x) => x.id === id)!;
    const parts = o.need.map((n) => {
      const have = n.hybridGh ? countHybridGh(s) : countBoth(s, n.id);
      const label = n.hybridGh ? t('order.bukiet.title') : itemName(n.id);
      return `${label} ${Math.min(have, n.n)}/${n.n}`;
    });
    const ok = o.need.every((n) => (n.hybridGh ? countHybridGh(s) : countBoth(s, n.id)) >= n.n);
    return { id, title: t('order.' + id + '.title'), desc: t('order.' + id + '.desc'), have: parts.join(' · '), ok, coins: o.coins };
  });
}
