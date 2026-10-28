import { MAPS, tileCenter } from './content.ts';
import {
  applyAction,
  catchUp,
  createGame,
  isState,
  listActions,
  normalize,
  simulate,
} from './logic.ts';
import type { GameState, Plant, Role } from './types.ts';

let failed = 0;

function check(cond: boolean, msg: string): void {
  if (!cond) {
    failed += 1;
    console.error('FAIL ' + msg);
  }
}

function stand(s: GameState, role: Role, map: GameState['characters']['ogrodnik']['map'], c: number, r: number, rot: number): void {
  const p = tileCenter(MAPS[map], c, r);
  const ch = s.characters[role];
  ch.map = map;
  ch.x = p.x;
  ch.z = p.z;
  ch.rot = rot;
}

function plant(p: Partial<Plant> & Pick<Plant, 'id' | 'c' | 'r' | 'species' | 'stage'>): Plant {
  return {
    plantedBy: 'ogrodnik',
    hybrid: false,
    needsWater: false,
    needsPrune: false,
    needsHeal: false,
    fertilized: false,
    quality: 1,
    since: 0,
    readyAt: null,
    staked: false,
    covered: false,
    ...p,
  };
}

const t0 = 1_700_000_000_000;
const s = createGame(t0);
s.connected.ogrodnik = true;
s.connected.zielarka = true;

const round = normalize(JSON.parse(JSON.stringify(s)) as GameState);
check(isState(round), 'zapis da się odczytać');
check(!JSON.stringify(round).includes('Infinity'), 'zapis bez Infinity');
check(round.coins === 20, 'monety startowe');

stand(s, 'ogrodnik', 'ogrod', 4, 7, Math.PI);
const actions = listActions(s, 'ogrodnik', t0);
check(actions.some((a) => a.id === 'kop' && a.enabled), 'kopanie przy grządce');

let now = t0;
applyAction(s, 'ogrodnik', { id: 'kop', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: Math.PI }, now);
check((s.flags.tut_dig ?? 0) >= 1, 'samouczek liczy kopanie');
now += 200;
applyAction(s, 'ogrodnik', { id: 'siej', species: 'marchew', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: Math.PI }, now);
check(s.plants.length === 1 && s.plants[0].needsWater, 'zasiana marchew czeka na wodę');

stand(s, 'zielarka', 'ogrod', 4, 7, Math.PI);
now += 200;
applyAction(s, 'zielarka', { id: 'podlej', x: s.characters.zielarka.x, z: s.characters.zielarka.z, rot: Math.PI }, now);
check(s.plants[0] && !s.plants[0].needsWater, 'zielarka podlała');

for (let i = 0; i < 6 && s.plants[0] && s.plants[0].stage !== 'mature'; i++) {
  const p = s.plants[0];
  p.needsWater = false;
  p.needsPrune = false;
  p.needsHeal = false;
  if (p.readyAt == null) p.readyAt = now;
  s.lastTick = now - 4000;
  now += 20000;
  catchUp(s, now);
}
check(s.plants[0]?.stage === 'mature', 'marchew dojrzewa');
now += 200;
applyAction(s, 'ogrodnik', { id: 'zbierz', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: Math.PI }, now);
check(s.characters.ogrodnik.inv.some((it) => it.id === 'crop_marchew'), 'zbiór marchwi');

s.plants = [
  plant({ id: 'd1', c: 4, r: 5, species: 'stokrotka', stage: 'mature' }),
  plant({ id: 'd2', c: 5, r: 5, species: 'stokrotka', stage: 'mature' }),
];
stand(s, 'zielarka', 'ogrod', 4, 5, 0);
now += 200;
applyAction(s, 'zielarka', { id: 'krzyzuj', x: s.characters.zielarka.x, z: s.characters.zielarka.z, rot: 0 }, now);
check(s.characters.zielarka.inv.some((it) => it.id === 'seed_stokrotka_pelna'), 'krzyżówka stokrotek');
check(s.plants.length === 0, 'krzyżówka zużywa kwiaty');

stand(s, 'ogrodnik', 'wies', 7, 10, 0);
now += 200;
applyAction(s, 'ogrodnik', { id: 'talk', npc: 'stanislaw', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: 0 }, now);
const witaj = s.quests.find((q) => q.id === 'witaj');
check(!!witaj && (witaj.progress.o0 ?? 0) >= 1, 'rozmowa z wójtem');
now += 200;
applyAction(s, 'ogrodnik', { id: 'quest_turnin', quest: 'witaj', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: 0 }, now);
check(s.quests.find((q) => q.id === 'witaj')?.status === 'done', 'oddane powitanie');
check(s.characters.ogrodnik.level >= 2, 'awans po zadaniu');

const beforeMap = s.characters.zielarka.map;
now += 200;
applyAction(s, 'zielarka', { id: 'travel', map: 'las', x: s.characters.zielarka.x, z: s.characters.zielarka.z, rot: 0 }, now);
check(s.characters.zielarka.map === 'las' && beforeMap !== 'las', 'podróż do lasu');

stand(s, 'ogrodnik', 'las', 3, 3, 0);
stand(s, 'zielarka', 'las', 2, 3, 0);
s.characters.ogrodnik.hp = 1;
s.characters.ogrodnik.downed = false;
s.characters.ogrodnik.invulnUntil = 0;
s.lastTick = now;
now += 50;
simulate(s, now, 0.02);
check(s.characters.ogrodnik.downed, 'ciernie powalają');
now += 200;
applyAction(s, 'zielarka', { id: 'ocuc', x: s.characters.zielarka.x, z: s.characters.zielarka.z, rot: 0 }, now);
check(!s.characters.ogrodnik.downed, 'partner ocuca');

stand(s, 'ogrodnik', 'ogrod', 6, 7, 0);
s.coins = 0;
const gh = s.buildings.greenhouse;
now += 200;
applyAction(s, 'ogrodnik', { id: 'buduj', build: 'greenhouse', x: s.characters.ogrodnik.x, z: s.characters.ogrodnik.z, rot: 0 }, now);
check(s.buildings.greenhouse === gh, 'budowa bez monet nie wstaje');

if (failed) throw new Error('selftest: ' + failed);
console.log('selftest ok');
