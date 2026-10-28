import { addCatalog, t } from './i18n.ts';
import type { EquipSlot, ItemKind, MapId, Role, Stats } from './types.ts';
import { TILE } from './util.ts';

export type PlantForm =
  | 'carrot'
  | 'lettuce'
  | 'daisy'
  | 'tomato'
  | 'berry'
  | 'tulip'
  | 'rose'
  | 'sun'
  | 'lavender'
  | 'mint';

export interface Species {
  id: string;
  name: string;
  kind: 'warzywo' | 'kwiat' | 'ziolo';
  hybrid: boolean;
  price: number;
  seedPrice: number;
  grow: [number, number, number];
  color: number;
  color2: number;
  form: PlantForm;
  shop: boolean;
}

export const SPECIES: Species[] = [
  { id: 'marchew', name: 'Marchew', kind: 'warzywo', hybrid: false, price: 9, seedPrice: 8, grow: [8000, 10000, 12000], color: 0xff8a2a, color2: 0x3cb85a, form: 'carrot', shop: true },
  { id: 'salata', name: 'Sałata', kind: 'warzywo', hybrid: false, price: 8, seedPrice: 8, grow: [8000, 10000, 11000], color: 0x7ed957, color2: 0x3aaa32, form: 'lettuce', shop: true },
  { id: 'stokrotka', name: 'Stokrotka', kind: 'kwiat', hybrid: false, price: 11, seedPrice: 10, grow: [7000, 9000, 11000], color: 0xfff6ea, color2: 0xffd84a, form: 'daisy', shop: true },
  { id: 'pomidor', name: 'Pomidor', kind: 'warzywo', hybrid: false, price: 16, seedPrice: 18, grow: [9000, 11000, 13000], color: 0xff4d4d, color2: 0x3aaa32, form: 'tomato', shop: false },
  { id: 'truskawka', name: 'Truskawka', kind: 'warzywo', hybrid: false, price: 18, seedPrice: 20, grow: [9000, 11000, 12000], color: 0xff3b5c, color2: 0x3cb85a, form: 'berry', shop: false },
  { id: 'tulipan', name: 'Tulipan', kind: 'kwiat', hybrid: false, price: 15, seedPrice: 16, grow: [8000, 10000, 12000], color: 0xff5fa2, color2: 0x6ed84a, form: 'tulip', shop: false },
  { id: 'roza', name: 'Róża', kind: 'kwiat', hybrid: false, price: 20, seedPrice: 24, grow: [10000, 12000, 14000], color: 0xe4234a, color2: 0x2f8f46, form: 'rose', shop: false },
  { id: 'slonecznik', name: 'Słonecznik', kind: 'kwiat', hybrid: false, price: 14, seedPrice: 14, grow: [9000, 12000, 14000], color: 0xffd23a, color2: 0x8a5a2a, form: 'sun', shop: false },
  { id: 'lawenda', name: 'Lawenda', kind: 'kwiat', hybrid: false, price: 17, seedPrice: 18, grow: [9000, 11000, 13000], color: 0xb388ff, color2: 0x6a4cc0, form: 'lavender', shop: false },
  { id: 'mieta', name: 'Mięta', kind: 'ziolo', hybrid: false, price: 12, seedPrice: 12, grow: [7000, 9000, 10000], color: 0x3de07a, color2: 0x1f9d4a, form: 'mint', shop: false },
  { id: 'stokrotka_pelna', name: 'Stokrotka pełna', kind: 'kwiat', hybrid: true, price: 30, seedPrice: 0, grow: [8000, 10000, 12000], color: 0xfffaf2, color2: 0xffe08a, form: 'daisy', shop: false },
  { id: 'rumianka', name: 'Rumianka', kind: 'kwiat', hybrid: true, price: 34, seedPrice: 0, grow: [8000, 10000, 12000], color: 0xffe29a, color2: 0xfff6ea, form: 'daisy', shop: false },
  { id: 'rozanka', name: 'Różanka', kind: 'kwiat', hybrid: true, price: 36, seedPrice: 0, grow: [9000, 11000, 13000], color: 0xff8fab, color2: 0xfff0f4, form: 'rose', shop: false },
  { id: 'zlotulipan', name: 'Złotulipan', kind: 'kwiat', hybrid: true, price: 36, seedPrice: 0, grow: [9000, 11000, 13000], color: 0xffc83d, color2: 0xff6b9a, form: 'tulip', shop: false },
  { id: 'lawendka', name: 'Lawendka', kind: 'kwiat', hybrid: true, price: 34, seedPrice: 0, grow: [8000, 10000, 12000], color: 0xd7c4ff, color2: 0xfff6ea, form: 'lavender', shop: false },
  { id: 'burgundka', name: 'Burgundka', kind: 'kwiat', hybrid: true, price: 40, seedPrice: 0, grow: [9000, 12000, 14000], color: 0x8e1e3a, color2: 0xffb3c7, form: 'rose', shop: false },
  { id: 'fiolroz', name: 'Fiolroza', kind: 'kwiat', hybrid: true, price: 40, seedPrice: 0, grow: [9000, 12000, 14000], color: 0xc86bff, color2: 0xe4234a, form: 'rose', shop: false },
  { id: 'mieszanka', name: 'Mieszańka', kind: 'kwiat', hybrid: true, price: 32, seedPrice: 0, grow: [8000, 10000, 12000], color: 0xff9ad5, color2: 0xffe66a, form: 'daisy', shop: false },
];

const HYBRID_OF: Record<string, string> = {
  'stokrotka+stokrotka': 'stokrotka_pelna',
  'stokrotka+tulipan': 'rumianka',
  'roza+stokrotka': 'rozanka',
  'slonecznik+tulipan': 'zlotulipan',
  'lawenda+stokrotka': 'lawendka',
  'roza+tulipan': 'burgundka',
  'lawenda+roza': 'fiolroz',
};

export function hybridSpecies(a: string, b: string): string {
  return HYBRID_OF[[a, b].sort().join('+')] ?? 'mieszanka';
}

export function getSpecies(id: string): Species {
  const s = SPECIES.find((x) => x.id === id);
  if (!s) throw new Error('species ' + id);
  return s;
}

export function seedId(species: string): string {
  return 'seed_' + species;
}
export function cropId(species: string): string {
  return 'crop_' + species;
}

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  desc: string;
  stack: number;
  buy: number;
  sell: number;
  slot?: EquipSlot;
  roles?: Role[];
  stats?: Partial<Stats>;
  shop?: boolean;
  color: number;
  heal?: number;
  clearSlow?: boolean;
}

function stat(p: Partial<Stats>): Partial<Stats> {
  return p;
}

const GEAR: ItemDef[] = [
  { id: 'motyka_drewno', kind: 'tool', name: 'Drewniana motyka', desc: 'Pierwsza motyka Ogrodnika. Lepiej niż gołe ręce.', stack: 1, buy: 0, sell: 4, slot: 'tool', roles: ['ogrodnik'], stats: stat({ attack: 4 }), color: 0xc4894a },
  { id: 'motyka_zelazo', kind: 'tool', name: 'Żelazna motyka', desc: 'Dzieło Miry. Gryzie ziemię i dziki.', stack: 1, buy: 0, sell: 20, slot: 'tool', roles: ['ogrodnik'], stats: stat({ attack: 9 }), color: 0xd9dde6 },
  { id: 'konewka_drewno', kind: 'tool', name: 'Drewniana konewka', desc: 'Jedyna konewka w ogrodzie. Napełnia się przy studni.', stack: 1, buy: 0, sell: 4, slot: 'tool', roles: ['zielarka'], stats: stat({ waterMax: 6, attack: 2 }), color: 0x8d6a43 },
  { id: 'konewka_miedz', kind: 'tool', name: 'Miedziana konewka', desc: 'Więcej wody, ładniejszy plusk.', stack: 1, buy: 0, sell: 22, slot: 'tool', roles: ['zielarka'], stats: stat({ waterMax: 9, attack: 4 }), color: 0xe08545 },
  { id: 'kapelusz_sloma', kind: 'gear', name: 'Słomkowy kapelusz', desc: 'Osłania czoło i dodaje otuchy.', stack: 1, buy: 0, sell: 5, slot: 'hat', roles: ['ogrodnik'], stats: stat({ defense: 1, maxHp: 8 }), color: 0xf2c14d },
  { id: 'wianek', kind: 'gear', name: 'Wianek', desc: 'Polne kwiaty splecione na głowę Zielarki.', stack: 1, buy: 0, sell: 5, slot: 'hat', roles: ['zielarka'], stats: stat({ defense: 1, maxHp: 10 }), color: 0xff6b9a },
  { id: 'kaptur', kind: 'gear', name: 'Kaptur wędrowca', desc: 'Lena mówi, że w jaskini jest cieplej.', stack: 1, buy: 0, sell: 12, slot: 'hat', stats: stat({ defense: 2, maxHp: 14 }), color: 0x6a4cc0 },
  { id: 'rekawice_lniane', kind: 'gear', name: 'Lniane rękawice', desc: 'Mniej drzazg, trochę obrony.', stack: 1, buy: 12, sell: 5, slot: 'gloves', stats: stat({ defense: 2 }), shop: true, color: 0xf4e2c4 },
  { id: 'rekawice_skora', kind: 'gear', name: 'Skórzane rękawice', desc: 'Ciernie mniej straszą.', stack: 1, buy: 28, sell: 10, slot: 'gloves', stats: stat({ defense: 4, attack: 1 }), color: 0x8a5a32 },
  { id: 'buty_drewniaki', kind: 'gear', name: 'Drewniaki', desc: 'Stukają po ścieżce.', stack: 1, buy: 12, sell: 4, slot: 'boots', stats: stat({ speed: 0.15, defense: 1 }), shop: true, color: 0xd7a15a },
  { id: 'buty_wedrowca', kind: 'gear', name: 'Buty wędrowca', desc: 'Do lasu, łąki i z powrotem.', stack: 1, buy: 0, sell: 14, slot: 'boots', stats: stat({ speed: 0.45, defense: 1 }), color: 0x5a7a3a },
  { id: 'fartuch', kind: 'gear', name: 'Fartuch zielarki', desc: 'Kieszenie na kompost i plastry.', stack: 1, buy: 22, sell: 8, slot: 'gloves', roles: ['zielarka'], stats: stat({ defense: 2, maxHp: 6 }), shop: true, color: 0x7ec8c0 },
  { id: 'bandaz', kind: 'consumable', name: 'Bandaż', desc: 'Opatruje 36 punktów zdrowia.', stack: 8, buy: 10, sell: 4, shop: true, color: 0xfff6ea, heal: 36 },
  { id: 'miod', kind: 'consumable', name: 'Słoik miodu', desc: 'Słodki plaster Bogdana. Leczy i na chwilę twardnieje skóra.', stack: 6, buy: 0, sell: 8, color: 0xffc83d, heal: 28 },
  { id: 'masc', kind: 'consumable', name: 'Maść na użądlenia', desc: 'Zdejmuje spowolnienie i leczy.', stack: 6, buy: 0, sell: 6, color: 0xc8f0c4, heal: 30, clearSlow: true },
  { id: 'kompost', kind: 'material', name: 'Kompost', desc: 'Zielarka sypie go pod rośliny. Przycinanie daje nowe porcje.', stack: 20, buy: 6, sell: 2, shop: true, color: 0x6b4428 },
  { id: 'ruda', kind: 'material', name: 'Ruda', desc: 'Ciemny kamień z jaskini. Mira wie, co z nim zrobić.', stack: 20, buy: 0, sell: 6, color: 0x8a93a8 },
  { id: 'grzyb', kind: 'material', name: 'Grzyb jaskiniowy', desc: 'Świeci blado. Lena zbiera takie do zielnika.', stack: 20, buy: 0, sell: 7, color: 0x7fd0ff },
  { id: 'ziele', kind: 'material', name: 'Polne ziele', desc: 'Pachnie lasem po deszczu.', stack: 20, buy: 0, sell: 5, color: 0x3ec04a },
  { id: 'jajko', kind: 'material', name: 'Jajko', desc: 'Ciepłe, prosto z kurnika.', stack: 12, buy: 0, sell: 10, color: 0xfff3d6 },
];

function buildItems(): Record<string, ItemDef> {
  const map: Record<string, ItemDef> = {};
  for (const g of GEAR) map[g.id] = g;
  for (const sp of SPECIES) {
    map[seedId(sp.id)] = {
      id: seedId(sp.id),
      kind: 'seed',
      name: `Nasiona: ${sp.name}`,
      desc: sp.hybrid ? 'Krzyżówka. Posadź ją, najlepiej w szklarni.' : `Nasiona. ${sp.kind === 'kwiat' ? 'Kwiat' : sp.kind === 'ziolo' ? 'Zioło' : 'Warzywo'}.`,
      stack: 99,
      buy: sp.seedPrice,
      sell: Math.max(1, Math.round(sp.seedPrice / 3)),
      shop: sp.shop,
      color: sp.color,
    };
    map[cropId(sp.id)] = {
      id: cropId(sp.id),
      kind: 'crop',
      name: sp.name,
      desc: sp.hybrid ? 'Kwiat, którego nie ma w starych zielnikach.' : 'Plon z wspólnego ogrodu.',
      stack: 99,
      buy: 0,
      sell: sp.price,
      color: sp.color2,
    };
  }
  return map;
}

export const ITEMS: Record<string, ItemDef> = buildItems();

export function itemName(id: string, meta?: string): string {
  const base = t('item.' + id + '.name');
  const shown = base === 'item.' + id + '.name' ? (ITEMS[id]?.name ?? id) : base;
  let n = shown;
  if (meta?.includes('gh')) n += t('meta.gh');
  if (meta?.includes('q2')) n += t('meta.q2');
  return n;
}

export interface SkillDef {
  id: string;
  role: Role;
  name: string;
  desc: string;
  needLevel: number;
  requires: string[];
  stats?: Partial<Stats>;
  active?: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'og_hp', role: 'ogrodnik', name: 'Twarda skóra', desc: '+18 zdrowia.', needLevel: 2, requires: [], stats: stat({ maxHp: 18 }) },
  { id: 'og_atk', role: 'ogrodnik', name: 'Mocne ramię', desc: '+4 do ataku motyką.', needLevel: 2, requires: [], stats: stat({ attack: 4 }) },
  { id: 'og_pest', role: 'ogrodnik', name: 'Pogromca szkodników', desc: 'Gonienie sięga dalej.', needLevel: 2, requires: [], stats: stat({ pestRadius: 1.15 }) },
  { id: 'og_grow', role: 'ogrodnik', name: 'Zielony kciuk', desc: 'To, co sam posiał, rośnie szybciej.', needLevel: 3, requires: ['og_hp'], stats: stat({ growBonus: 0.18 }) },
  { id: 'og_szarza', role: 'ogrodnik', name: 'Szarża', desc: 'Nowe działanie: rzut do przodu i szerokie uderzenie.', needLevel: 3, requires: ['og_atk'], active: 'szarza' },
  { id: 'og_def', role: 'ogrodnik', name: 'Ogrodowy pancerz', desc: '+4 obrony.', needLevel: 4, requires: ['og_hp'], stats: stat({ defense: 4 }) },
  { id: 'zi_hp', role: 'zielarka', name: 'Ciepła dłoń', desc: '+16 zdrowia.', needLevel: 2, requires: [], stats: stat({ maxHp: 16 }) },
  { id: 'zi_woda', role: 'zielarka', name: 'Duża konewka', desc: '+3 łyki wody.', needLevel: 2, requires: [], stats: stat({ waterMax: 3 }) },
  { id: 'zi_cross', role: 'zielarka', name: 'Mistrzyni krzyżówek', desc: 'Czasem z krzyżówki zostaje drugie nasiono.', needLevel: 3, requires: [], stats: stat({ crossBonus: 1 }) },
  { id: 'zi_uzdrow', role: 'zielarka', name: 'Uzdrowienie', desc: 'Nowe działanie: leczy siebie albo partnera obok. Podnosi powalonego.', needLevel: 2, requires: ['zi_hp'], active: 'uzdrow' },
  { id: 'zi_pylek', role: 'zielarka', name: 'Pyłek', desc: 'Nowe działanie: chmura pyłku. Osy i pszczoły nie lubią jej bardzo.', needLevel: 3, requires: ['zi_uzdrow'], active: 'pylek' },
  { id: 'zi_storm', role: 'zielarka', name: 'Burzowa osłona', desc: 'Pioruny robią jej połowę krzywdy.', needLevel: 4, requires: ['zi_hp'], stats: stat({ stormResist: 0.5 }) },
];

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  map: MapId;
  c: number;
  r: number;
  rot: number;
  skin: number;
  cloth: number;
  hat: 'elder' | 'merchant' | 'bee' | 'botanist' | 'smith';
}

export const NPCS: NpcDef[] = [
  { id: 'stanislaw', name: 'Stanisław', title: 'Wójt Piotrogrodu', map: 'wies', c: 7, r: 10, rot: 0, skin: 0xffd2b8, cloth: 0x4a6fd6, hat: 'elder' },
  { id: 'henio', name: 'Henio', title: 'Kupiec', map: 'wies', c: 8, r: 9, rot: 0, skin: 0xffd0b0, cloth: 0xe07a32, hat: 'merchant' },
  { id: 'mira', name: 'Mira', title: 'Kowalka', map: 'wies', c: 3, r: 7, rot: 0, skin: 0xf0c2a8, cloth: 0x6b4a3a, hat: 'smith' },
  { id: 'lena', name: 'Lena', title: 'Botaniczka', map: 'wies', c: 10, r: 5, rot: 0, skin: 0xffd8c2, cloth: 0x3aaa8a, hat: 'botanist' },
  { id: 'bogdan', name: 'Bogdan', title: 'Pszczelarz', map: 'laka', c: 9, r: 10, rot: 0, skin: 0xe8c0a4, cloth: 0xc4a15a, hat: 'bee' },
];

export function getNpc(id: string): NpcDef {
  const n = NPCS.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
}

export interface Objective {
  type: string;
  n: number;
  text: string;
  npc?: string;
  item?: string;
  kind?: string;
  build?: string;
  map?: MapId;
  hybrid?: boolean;
  greenhouse?: boolean;
}

export interface QuestDef {
  id: string;
  kind: 'main' | 'side';
  npc: string;
  requires: string[];
  title: string;
  desc: string;
  coop?: boolean;
  objectives: Objective[];
  rewards: { coins?: number; xp?: number; items?: { id: string; n: number }[]; unlocks?: string[] };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'witaj', kind: 'main', npc: 'stanislaw', requires: [],
    title: 'Witajcie w Piotrogrodzie',
    desc: 'Wójt czeka na rynku. Bez was ogród na skraju wsi zarasta.',
    objectives: [{ type: 'talk', npc: 'stanislaw', n: 1, text: 'Porozmawiaj z wójtem Stanisławem' }],
    rewards: { coins: 15, xp: 22 },
  },
  {
    id: 'grzadki', kind: 'main', npc: 'stanislaw', requires: ['witaj'], coop: true,
    title: 'Pierwsze grządki',
    desc: 'Ogrodnik kopie i sieje. Zielarka podlewa. Inaczej nic nie wzejdzie.',
    objectives: [
      { type: 'till', n: 2, text: 'Skopcie grządki: {cur}/{n}' },
      { type: 'plant', n: 2, text: 'Zasiejcie rośliny: {cur}/{n}' },
      { type: 'water', n: 2, text: 'Podlejcie rośliny: {cur}/{n}' },
    ],
    rewards: { coins: 20, xp: 24, items: [{ id: 'seed_salata', n: 2 }] },
  },
  {
    id: 'zbiory', kind: 'main', npc: 'stanislaw', requires: ['grzadki'],
    title: 'Pierwszy zbiór',
    desc: 'Dojrzały plon ląduje w torbie Ogrodnika. Henio na taki czeka.',
    objectives: [{ type: 'harvest', n: 2, text: 'Zbierzcie plony: {cur}/{n}' }],
    rewards: { coins: 25, xp: 26, unlocks: ['seed_pomidor', 'seed_mieta'] },
  },
  {
    id: 'szkodniki', kind: 'main', npc: 'stanislaw', requires: ['zbiory'],
    title: 'Kłopoty na grządkach',
    desc: 'Ślimaki, krety i wrony. Ogrodnik je przegania, Zielarka leczy pogryzione.',
    objectives: [{ type: 'chase', n: 2, text: 'Przegonione szkodniki: {cur}/{n}' }],
    rewards: { coins: 20, xp: 24, items: [{ id: 'rekawice_skora', n: 1 }] },
  },
  {
    id: 'burza', kind: 'main', npc: 'stanislaw', requires: ['szkodniki'], coop: true,
    title: 'Burza nad ogrodem',
    desc: 'Ogrodnik umacnia szklarnię albo wbija podpórki. Zielarka osłania rośliny.',
    objectives: [{ type: 'storm', n: 1, text: 'Osłońcie ogród w czasie burzy' }],
    rewards: { coins: 30, xp: 28 },
  },
  {
    id: 'szklarnia', kind: 'main', npc: 'stanislaw', requires: ['burza'],
    title: 'Szkło i ciepło',
    desc: 'Szklarnia trzyma burzę z daleka i daje dach krzyżówkom.',
    objectives: [{ type: 'build', build: 'greenhouse', n: 1, text: 'Zbudujcie szklarnię' }],
    rewards: { coins: 15, xp: 30, unlocks: ['seed_tulipan', 'seed_lawenda'] },
  },
  {
    id: 'hybryda', kind: 'main', npc: 'lena', requires: ['szklarnia'], coop: true,
    title: 'Kwiat, którego nie ma',
    desc: 'Zielarka krzyżuje dwa dojrzałe kwiaty. Ogrodnik sadzi nasiono w szklarni. Oboje doprowadzają je do zbioru.',
    objectives: [
      { type: 'cross', n: 1, text: 'Skrzyżujcie kwiaty: {cur}/{n}' },
      { type: 'harvest', n: 1, hybrid: true, greenhouse: true, text: 'Zbierzcie krzyżówkę ze szklarni' },
    ],
    rewards: { coins: 50, xp: 40, unlocks: ['house', 'seed_roza'] },
  },
  {
    id: 'domek', kind: 'main', npc: 'stanislaw', requires: ['hybryda'], coop: true,
    title: 'Ławka dla dwojga',
    desc: 'Postawcie domek i usiądźcie razem. Stanisław chce to zobaczyć z rynku, a wy po prostu odsapnąć.',
    objectives: [
      { type: 'build', build: 'house', n: 1, text: 'Zbudujcie domek' },
      { type: 'sit_together', n: 1, text: 'Usiądźcie razem na ławce' },
    ],
    rewards: { coins: 40, xp: 48 },
  },
  {
    id: 'henio_handel', kind: 'side', npc: 'henio', requires: ['witaj'],
    title: 'Pierwszy interes',
    desc: 'Henio kupi trzy dowolne plony. Mówi, że liczy uczciwie. Nikt mu nie wierzy, ale płaci.',
    objectives: [{ type: 'sell', n: 3, text: 'Sprzedane plony: {cur}/{n}' }],
    rewards: { coins: 15, xp: 18, unlocks: ['seed_truskawka', 'seed_slonecznik'] },
  },
  {
    id: 'bogdan_kwiaty', kind: 'side', npc: 'bogdan', requires: ['witaj'],
    title: 'Cicho przy ulu',
    desc: 'Bogdan warczy, ale za stokrotki mięknie. Nie depczcie uli na łące.',
    objectives: [{ type: 'give', npc: 'bogdan', item: 'crop_stokrotka', n: 3, text: 'Stokrotki dla Bogdana: {cur}/{n}' }],
    rewards: { coins: 18, xp: 22, items: [{ id: 'miod', n: 2 }] },
  },
  {
    id: 'osy', kind: 'side', npc: 'bogdan', requires: ['bogdan_kwiaty'],
    title: 'Osy, nie pszczoły',
    desc: '„Pszczół nie tykać. Osy w lesie możecie gonić” — Bogdan, głośniej niż trzeba.',
    objectives: [{ type: 'kill', kind: 'osa', n: 3, text: 'Pokonane osy: {cur}/{n}' }],
    rewards: { xp: 24, items: [{ id: 'masc', n: 2 }], coins: 15 },
  },
  {
    id: 'mira_ruda', kind: 'side', npc: 'mira', requires: ['witaj'], coop: true,
    title: 'Ruda dla kowalki',
    desc: 'W jaskini jest ruda i szlam. Przynieście Mirze trzy kawałki, a wykucie narzędzia dla was obojga.',
    objectives: [{ type: 'give', npc: 'mira', item: 'ruda', n: 3, text: 'Ruda dla Miry: {cur}/{n}' }],
    rewards: { xp: 32, coins: 20, items: [{ id: 'motyka_zelazo', n: 1 }, { id: 'konewka_miedz', n: 1 }] },
  },
  {
    id: 'las_dziki', kind: 'side', npc: 'mira', requires: ['witaj'],
    title: 'Dziki na ścieżce',
    desc: 'Dwa dziki tarasują skrót przez las. Mira obiecuje buty, jeśli droga będzie znowu cicha.',
    objectives: [{ type: 'kill', kind: 'dzik', n: 2, text: 'Pokonane dziki: {cur}/{n}' }],
    rewards: { xp: 28, items: [{ id: 'buty_wedrowca', n: 1 }] },
  },
  {
    id: 'lenka_ziola', kind: 'side', npc: 'lena', requires: ['zbiory'],
    title: 'Ziele i cień jaskini',
    desc: 'Lena prosi o polne zioła z lasu i świecące grzyby. Mówi, że Piotrogród pachnie inaczej niż reszta świata.',
    objectives: [
      { type: 'give', npc: 'lena', item: 'ziele', n: 3, text: 'Polne ziele: {cur}/{n}' },
      { type: 'give', npc: 'lena', item: 'grzyb', n: 2, text: 'Grzyby jaskiniowe: {cur}/{n}' },
    ],
    rewards: { xp: 26, items: [{ id: 'seed_lawenda', n: 2 }, { id: 'kompost', n: 2 }] },
  },
  {
    id: 'szlamy', kind: 'side', npc: 'lena', requires: ['witaj'],
    title: 'Szlam pod Piotrogrodem',
    desc: 'W jaskini coś się przelewa. Lena chce próbkę spokoju, czyli mniej szlamu.',
    objectives: [{ type: 'kill', kind: 'szlam', n: 3, text: 'Pokonane szlamy: {cur}/{n}' }],
    rewards: { xp: 30, coins: 25, items: [{ id: 'kaptur', n: 1 }] },
  },
  {
    id: 'we_dwoje_laka', kind: 'side', npc: 'stanislaw', requires: ['grzadki'], coop: true,
    title: 'Spacer nad jezioro',
    desc: 'Stanisław prosi, żebyście oboje stanęli na łące. Twierdzi, że jezioro lubi pary.',
    objectives: [{ type: 'both_on', map: 'laka', n: 1, text: 'Stańcie oboje na łące' }],
    rewards: { xp: 18, coins: 15, items: [{ id: 'seed_slonecznik', n: 1 }] },
  },
];

export function questDef(id: string): QuestDef {
  const q = QUESTS.find((x) => x.id === id);
  if (!q) throw new Error(id);
  return q;
}

export const LINES: Record<string, string[]> = {
  'stanislaw.hello': [
    'O, jesteście. Piotrogród od dawna czeka na parę, która nie kłóci się o konewkę.',
    'Jestem Stanisław, tutejszy wójt. Ogród na skraju wsi jest wasz.',
    'Jeden kopie, druga podlewa. Jak zbierzecie pierwsze plony, wpadnijcie. I nie wpuszczajcie kretów.',
  ],
  'stanislaw.busy': [
    'Robota sama się nie zrobi. Ogród jest na południe od rynku, las na zachód, łąka na wschód, jaskinia na północ.',
  ],
  'stanislaw.turnin': [
    'No proszę. Piotrogród już was poznaje po butach. Macie, z gminy.',
  ],
  'stanislaw.offer': [
    'Mam jeszcze jedną prośbę. Nic wielkiego, ale we dwoje jakoś raźniej.',
  ],
  'henio.hello': [
    'Henio z Piotrogrodu, do usług. Kupię, sprzedam, policzę dwa razy i jakoś wyjdzie.',
    'Świeże warzywa biorę od ręki. Jak dorośniecie do szklarni, pogadamy o bukietach.',
  ],
  'henio.busy': [
    'Targ jest otwarty. Zlecenia wiszą na tablicy, nawet jak tablica to moja głowa.',
  ],
  'henio.turnin': [
    'Interes się zgadza. Trzymajcie resztę i nie mówcie wójtowi, że dałem uczciwie.',
  ],
  'henio.offer': [
    'Słuchajcie, mam mały handel. Trzy plony, dobre monety, zero gadania o pogodzie.',
  ],
  'bogdan.hello': [
    'Ciszej. Pszczoły pracują, a wy tupiecie jak dziki.',
    'Jestem Bogdan. Uli nie dotykać. Jak już musicie coś przynieść, to kwiaty, nie rady.',
  ],
  'bogdan.busy': [
    'Miód będzie, jak przestaniecie stać w progu ula. Trzy kroki w tył, proszę.',
  ],
  'bogdan.turnin': [
    'No. Na stokrotki mogę spojrzeć. Masło pszczele... miód. Bierzcie i idźcie ciszej niż przyszliście.',
  ],
  'bogdan.offer': [
    'Osy w lesie to nie moje pszczoły. Możecie je gonić. Pszczół nie.',
  ],
  'lena.hello': [
    'Lena. Zapisuję rośliny, których jeszcze nie ma w zielnikach.',
    'Słyszałam, że w Piotrogrodzie da się skrzyżować kwiaty. Pokażcie mi coś, czego nie znam — najlepiej spod szkła.',
  ],
  'lena.busy': [
    'Jaskinia pachnie rudą i szlamem. Las pachnie zielem. Jak zbierzecie jedno i drugie, chętnie powącham.',
  ],
  'lena.turnin': [
    'Piękne. Dopisuję do zielnika: „znalezione w Piotrogrodzie, we dwoje”.',
  ],
  'lena.offer': [
    'Mam prośbę terenową. Nic nie zginie, może poza szlamem.',
  ],
  'mira.hello': [
    'Mira. Kowalam od świtu. Drewniana motyka to nie narzędzie, to prośba o odciski.',
    'W jaskini jest ruda. Trzy kawałki i zrobię wam rzeczy, które nie pękną w czwartek.',
  ],
  'mira.busy': [
    'Dziki na leśnej ścieżce psują mi dostawy węgla. Albo ruda, albo dziki — byle konkret.',
  ],
  'mira.turnin': [
    'Dobra stal lubi konkretnych ludzi. Macie. Nie zgubcie tego w sałacie.',
  ],
  'mira.offer': [
    'Jest robota. Głośna albo ciężka. Wybierajcie, ja i tak rozgrzałam piec.',
  ],
};

export interface OrderDef {
  id: string;
  title: string;
  desc: string;
  need: { id: string; n: number; hybridGh?: boolean }[];
  coins: number;
  xp: number;
  when?: 'start' | 'greenhouse';
}

export const ORDERS: OrderDef[] = [
  { id: 'koszyk', title: 'Koszyk dla wójta', desc: 'Dwie marchewki i dwie sałaty.', need: [{ id: 'crop_marchew', n: 2 }, { id: 'crop_salata', n: 2 }], coins: 40, xp: 14, when: 'start' },
  { id: 'jajka', title: 'Świeże jajka', desc: 'Dwa jajka z waszego kurnika.', need: [{ id: 'jajko', n: 2 }], coins: 30, xp: 12, when: 'start' },
  { id: 'bukiet', title: 'Bukiet z Piotrogrodu', desc: 'Kwiat krzyżówki wyhodowany w szklarni.', need: [{ id: 'hybrid_gh', n: 1, hybridGh: true }], coins: 90, xp: 30, when: 'greenhouse' },
  { id: 'mieta', title: 'Pęczek mięty', desc: 'Dwie mięty do herbaty Henia.', need: [{ id: 'crop_mieta', n: 2 }], coins: 34, xp: 12, when: 'start' },
];

export interface BuildDef {
  id: string;
  name: string;
  cost: number;
  desc: string;
}

export const BUILDS: BuildDef[] = [
  { id: 'fence', name: 'Płot', cost: 5, desc: 'Krótki płotek na trawie.' },
  { id: 'lampion', name: 'Lampion', cost: 8, desc: 'Ciepłe światełko na trawniku.' },
  { id: 'coop', name: 'Kurnik', cost: 40, desc: 'Kury znoszą jajka same.' },
  { id: 'greenhouse', name: 'Szklarnia', cost: 60, desc: 'Chroni przed burzą. Tu rosną krzyżówki na bukiet.' },
  { id: 'house', name: 'Domek z ławką', cost: 90, desc: 'Mały dom i ławka, na której siądziecie oboje.' },
];

export interface MobDef {
  hp: number;
  speed: number;
  dmg: number;
  aggro: number;
  pest?: boolean;
  fly?: boolean;
  neutral?: boolean;
  charge?: boolean;
  xp: number;
}

export const MOBS: Record<string, MobDef> = {
  slimak: { hp: 14, speed: 0.62, dmg: 0, aggro: 0, pest: true, xp: 6 },
  kret: { hp: 18, speed: 0.78, dmg: 0, aggro: 0, pest: true, xp: 7 },
  wrona: { hp: 12, speed: 1.35, dmg: 0, aggro: 0, pest: true, fly: true, xp: 7 },
  osa: { hp: 16, speed: 1.75, dmg: 8, aggro: 6.2, fly: true, xp: 10 },
  pszczola: { hp: 12, speed: 1.45, dmg: 7, aggro: 7, fly: true, neutral: true, xp: 4 },
  dzik: { hp: 48, speed: 1.2, dmg: 13, aggro: 5.6, charge: true, xp: 16 },
  szlam: { hp: 36, speed: 0.72, dmg: 10, aggro: 4.6, xp: 12 },
  szlam_maly: { hp: 14, speed: 0.95, dmg: 6, aggro: 4.2, xp: 4 },
  kret_las: { hp: 28, speed: 0.95, dmg: 9, aggro: 3.8, xp: 10 },
};

export const MOB_SPAWNS: Record<MapId, { kind: string; c: number; r: number }[]> = {
  ogrod: [],
  wies: [],
  las: [
    { kind: 'dzik', c: 4, r: 4 },
    { kind: 'dzik', c: 6, r: 8 },
    { kind: 'osa', c: 6, r: 2 },
    { kind: 'osa', c: 8, r: 4 },
    { kind: 'osa', c: 3, r: 9 },
    { kind: 'kret_las', c: 7, r: 4 },
  ],
  laka: [
    { kind: 'pszczola', c: 3, r: 8 },
    { kind: 'pszczola', c: 8, r: 8 },
    { kind: 'pszczola', c: 5, r: 11 },
  ],
  jaskinia: [
    { kind: 'szlam', c: 3, r: 2 },
    { kind: 'szlam', c: 7, r: 5 },
    { kind: 'szlam', c: 5, r: 7 },
    { kind: 'szlam', c: 8, r: 9 },
  ],
};

export interface MapDef {
  id: MapId;
  rows: string[];
  cols: number;
  exits: { c: number; r: number; to: MapId }[];
  arrival: Partial<Record<MapId | 'default', { c: number; r: number; rot: number }>>;
}

function mapExits(id: MapId, rows: string[]): { c: number; r: number; to: MapId }[] {
  const h = rows.length;
  const w = rows[0].length;
  const out: { c: number; r: number; to: MapId }[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (rows[r][c] !== 'e') continue;
      let to: MapId = 'wies';
      if (id === 'ogrod') to = 'wies';
      else if (id === 'wies') {
        if (r <= 1) to = 'jaskinia';
        else if (r >= h - 2) to = 'ogrod';
        else if (c === 0) to = 'las';
        else to = 'laka';
      }
      out.push({ c, r, to });
    }
  }
  return out;
}

function makeMap(
  id: MapId,
  rows: string[],
  arrival: MapDef['arrival'],
): MapDef {
  const w = rows[0].length;
  for (const row of rows) {
    if (row.length !== w) throw new Error(`${id} width ${row}`);
  }
  return { id, rows, cols: w, exits: mapExits(id, rows), arrival };
}

export const MAPS: Record<MapId, MapDef> = {
  ogrod: makeMap('ogrod', [
    'tttteeeettt',
    'tgggpppgggt',
    'tggbbbbbggt',
    'tggbbbbbgWt',
    'tggbbbbbggt',
    'tggbbbbbggt',
    'tgCbbbbbggt',
    'tHHHpGGGggt',
    'tHHHpGGGggt',
    'tgpppppppgt',
    'tggpggpgggt',
    'tgggpppgggt',
    'ttgggggggtt',
  ], {
    default: { c: 5, r: 10, rot: Math.PI },
    wies: { c: 5, r: 1, rot: Math.PI },
  }),
  wies: makeMap('wies', [
    'ttttteeeetttt',
    'tgggggpppgggt',
    'tgHHHgpppHHHt',
    'tgHHHgpppHHHt',
    'tgggggpppgggt',
    'tgggggpppgggt',
    'epppppppppppe',
    'tgggFpppggggt',
    'tggggpSpggggt',
    'tgggggpppgggt',
    'tgggggpppgggt',
    'tpppppppppppt',
    'tgggggpppgggt',
    'ttttteeeetttt',
  ], {
    default: { c: 6, r: 12, rot: Math.PI },
    ogrod: { c: 6, r: 12, rot: Math.PI },
    jaskinia: { c: 6, r: 1, rot: 0 },
    las: { c: 1, r: 6, rot: Math.PI / 2 },
    laka: { c: 11, r: 6, rot: -Math.PI / 2 },
  }),
  las: makeMap('las', [
    'ttttttttttt',
    'tttgggggttt',
    'ttggzggzgtt',
    'ttgnnngngtt',
    'ttgggggggtt',
    'ttgggtgggtt',
    'tpppppppppe',
    'ttgggtgggtt',
    'ttgnnggngtt',
    'ttggzggzgtt',
    'tttgggggttt',
    'ttttgggtttt',
    'ttttttttttt',
  ], {
    default: { c: 8, r: 6, rot: -Math.PI / 2 },
    wies: { c: 8, r: 6, rot: -Math.PI / 2 },
  }),
  laka: makeMap('laka', [
    'tgggggggggt',
    'ggsssssssgg',
    'gssaaaaassg',
    'gsadddddasg',
    'gsaaddddaag',
    'gsadddddasg',
    'egssaaaaasg',
    'ggsssssssgg',
    'ggggggggggg',
    'gghgggghggg',
    'ggggzgzgggg',
    'ggggggggggg',
    'tgggggggggt',
  ], {
    default: { c: 2, r: 6, rot: Math.PI / 2 },
    wies: { c: 2, r: 6, rot: Math.PI / 2 },
  }),
  jaskinia: makeMap('jaskinia', [
    'kkkkkkkkkkk',
    'kcccococcck',
    'kccccccccck',
    'kccckkkccck',
    'kcoccccccck',
    'kccccccccck',
    'kccmmmmmcck',
    'kccccccccck',
    'kcccoccocck',
    'kccccccccck',
    'kkkcckccckk',
    'kkccccccckk',
    'kkkkkeekkkk',
  ], {
    default: { c: 5, r: 11, rot: Math.PI },
    wies: { c: 5, r: 11, rot: Math.PI },
  }),
};

export const MAP_ORDER: MapId[] = ['ogrod', 'wies', 'las', 'laka', 'jaskinia'];

export function tileCenter(map: MapDef, c: number, r: number): { x: number; z: number } {
  return {
    x: (c - (map.cols - 1) / 2) * TILE,
    z: (r - (map.rows.length - 1) / 2) * TILE,
  };
}

export function worldToTile(map: MapDef, x: number, z: number): { c: number; r: number; ch: string } | null {
  const c = Math.round(x / TILE + (map.cols - 1) / 2);
  const r = Math.round(z / TILE + (map.rows.length - 1) / 2);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows.length) return null;
  return { c, r, ch: map.rows[r][c] };
}

export function tileChar(map: MapDef, c: number, r: number): string {
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows.length) return 'k';
  return map.rows[r][c];
}

const bag: Record<string, string> = {};
for (const sp of SPECIES) {
  bag['item.' + seedId(sp.id) + '.name'] = `Nasiona: ${sp.name}`;
  bag['item.' + cropId(sp.id) + '.name'] = sp.name;
  bag['item.' + seedId(sp.id) + '.desc'] = ITEMS[seedId(sp.id)].desc;
  bag['item.' + cropId(sp.id) + '.desc'] = ITEMS[cropId(sp.id)].desc;
}
for (const it of Object.values(ITEMS)) {
  bag['item.' + it.id + '.name'] = it.name;
  bag['item.' + it.id + '.desc'] = it.desc;
}
for (const sk of SKILLS) {
  bag['skill.' + sk.id + '.name'] = sk.name;
  bag['skill.' + sk.id + '.desc'] = sk.desc;
}
for (const n of NPCS) {
  bag['npc.' + n.id + '.name'] = n.name;
  bag['npc.' + n.id + '.title'] = n.title;
}
for (const q of QUESTS) {
  bag['quest.' + q.id + '.title'] = q.title;
  bag['quest.' + q.id + '.desc'] = q.desc;
  q.objectives.forEach((o, i) => {
    bag['quest.' + q.id + '.o' + i] = o.text;
  });
}
for (const [k, lines] of Object.entries(LINES)) {
  lines.forEach((line, i) => {
    bag['line.' + k + '.' + i] = line;
  });
}
for (const o of ORDERS) {
  bag['order.' + o.id + '.title'] = o.title;
  bag['order.' + o.id + '.desc'] = o.desc;
}
for (const b of BUILDS) {
  bag['build.' + b.id + '.name'] = b.name;
  bag['build.' + b.id + '.desc'] = b.desc;
}
addCatalog('pl', bag);

export function linesOf(key: string): string[] {
  const src = LINES[key] ?? [];
  return src.map((_, i) => t('line.' + key + '.' + i));
}
