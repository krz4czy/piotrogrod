export type Role = 'ogrodnik' | 'zielarka';
export type MapId = 'ogrod' | 'wies' | 'las' | 'laka' | 'jaskinia';
export type EquipSlot = 'hat' | 'gloves' | 'boots' | 'tool';
export type PlantStage = 'seed' | 'sprout' | 'growing' | 'mature';
export type ItemKind = 'seed' | 'crop' | 'tool' | 'gear' | 'consumable' | 'material' | 'decor';

export const ROLES: Role[] = ['ogrodnik', 'zielarka'];

export interface Stats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  waterMax: number;
  growBonus: number;
  pestRadius: number;
  crossBonus: number;
  stormResist: number;
}

export interface Stack {
  id: string;
  n: number;
  meta?: string;
}

export interface Character {
  role: Role;
  map: MapId;
  x: number;
  z: number;
  rot: number;
  hp: number;
  downed: boolean;
  downedAt: number;
  xp: number;
  level: number;
  skillPoints: number;
  skills: string[];
  inv: Stack[];
  equip: Partial<Record<EquipSlot, string>>;
  water: number;
  sitting: boolean;
  anim: string;
  emote: string;
  emoteUntil: number;
  invulnUntil: number;
  posLockUntil: number;
  slowUntil: number;
  cd: Record<string, number>;
  buffDefUntil: number;
  buffDef: number;
}

export interface Plant {
  id: string;
  c: number;
  r: number;
  species: string;
  stage: PlantStage;
  plantedBy: Role;
  hybrid: boolean;
  needsWater: boolean;
  needsPrune: boolean;
  needsHeal: boolean;
  fertilized: boolean;
  quality: number;
  since: number;
  readyAt: number | null;
  staked: boolean;
  covered: boolean;
}

export interface Mob {
  id: string;
  kind: string;
  map: MapId;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  ai: string;
  cd: number;
  peck: number;
  deadAt: number;
  aggroUntil: number;
  slowUntil: number;
  homeX: number;
  homeZ: number;
  vx: number;
  vz: number;
  wander: number;
  chargeLeft: number;
  split: boolean;
}

export interface Spawner {
  id: string;
  map: MapId;
  kind: string;
  x: number;
  z: number;
  mobId: string;
  respawnAt: number;
}

export interface QuestInst {
  id: string;
  status: 'available' | 'active' | 'done';
  progress: Record<string, number>;
}

export interface Notice {
  id: number;
  role: Role | 'all';
  msg: string;
  sfx?: string;
  until: number;
}

export interface Fx {
  id: number;
  kind: string;
  map: MapId;
  x: number;
  z: number;
  until: number;
  text?: string;
  color?: string;
}

export interface SoilCell {
  tilled: boolean;
  wetUntil: number;
}

export interface NodeRes {
  key: string;
  map: MapId;
  c: number;
  r: number;
  kind: 'ore' | 'shroom' | 'herb';
  left: number;
  respawn: number;
}

export interface Weather {
  kind: 'clear' | 'warning' | 'storm';
  until: number;
  nextAt: number;
  secured: boolean;
  seenGarden: boolean;
  protected: number;
}

export interface GameState {
  v: number;
  rev: number;
  createdAt: number;
  lastTick: number;
  coins: number;
  unlocks: string[];
  buildings: { well: boolean; greenhouse: boolean; coop: boolean; house: boolean };
  fences: { c: number; r: number }[];
  decors: { id: string; c: number; r: number }[];
  soil: Record<string, SoilCell>;
  plants: Plant[];
  mobs: Mob[];
  spawners: Spawner[];
  nodes: NodeRes[];
  ensured: MapId[];
  quests: QuestInst[];
  orders: string[];
  eggs: number;
  nextEgg: number;
  weather: Weather;
  nextPest: number;
  characters: Record<Role, Character>;
  connected: Record<Role, boolean>;
  invite: { from: Role; map: MapId; until: number } | null;
  notices: Notice[];
  noticeSeq: number;
  fx: Fx[];
  fxSeq: number;
  flags: Record<string, number>;
}

export interface ActionMsg {
  id: string;
  x: number;
  z: number;
  rot: number;
  species?: string;
  build?: string;
  item?: string;
  qty?: number;
  npc?: string;
  quest?: string;
  map?: MapId;
  skill?: string;
  order?: string;
  meta?: string;
}

export interface ActionView {
  id: string;
  label: string;
  enabled: boolean;
  reason: string;
  panel?: 'seeds' | 'build';
  item?: string;
}

export interface SaveBlob {
  savedAt: number;
  rev: number;
  state: GameState;
}
