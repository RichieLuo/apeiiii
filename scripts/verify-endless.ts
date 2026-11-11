import assert from 'node:assert/strict';
import { createNewGame, makeFloor, makeUnit, squireStatsOf, bossForFloor, heroStatsOf, isFloorCleared } from '../src/game/core/state';
import { Simulation } from '../src/game/core/simulation';
import { HEROES, HERO_ORDER } from '../src/game/data/heroes';
import { MONSTERS, regionOfFloor } from '../src/game/data/monsters';
import { monsterHpAt, monsterAtkAt, monsterGoldAt, heroUpgradeCost, squireUpgradeCost } from '../src/game/data/economy';
import { exportSave, validateImport } from '../src/platform/db';

function gateFixture(top: number, mode: 'endless' | 'classic' = 'endless') {
  const state = createNewGame(42);
  state.mode = mode;
  state.maxFloorUnlocked = top;
  state.highestClearedFloor = top - 1;
  state.selectedFloor = top;
  state.heroes.hero_guard.enabled = false;
  state.floors = {};
  for (let floor = top - 9; floor <= top; floor++) {
    const entry = state.floors[floor] = makeFloor(floor, true);
    entry.cleared = floor < top;
    entry.firstClearRewarded = floor < top;
    entry.challenge = floor < top ? 'cleared' : 'active';
  }
  const gate = state.floors[top];
  gate.currentWave = 0;
  gate.waves = [{ index: 0, monsterId: bossForFloor(top), total: 1,
    remainingSpawns: 0, nextSpawnAt: 0, alive: 0, done: false }];
  state.units.push(makeUnit(state, 'squire', 'unit_summon_squire', top, 'ally', 600, squireStatsOf(state)));
  return new Simulation(state);
}

function checkFinite(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Non-finite game value');
  else if (value && typeof value === 'object') Object.values(value).forEach(checkFinite);
}

assert.equal(createNewGame().mode, 'endless');
assert.equal(HERO_ORDER.length, 24);
assert.equal(HERO_ORDER.filter(id => HEROES[id].melee).length, 12);
assert.equal(HERO_ORDER.filter(id => !HEROES[id].melee).length, 12);
assert.equal(Object.values(MONSTERS).filter((m) => m.kind === 'enemy').length, 18);
assert.equal(Object.values(MONSTERS).filter((m) => m.kind === 'boss').length, 6);
assert.equal(regionOfFloor(301), 1);
assert.equal(regionOfFloor(601), 1);
assert.notEqual(bossForFloor(10), bossForFloor(20));

// 导入旧版八英雄存档，保留已有养成并补全新角色。
const legacy = JSON.parse(exportSave(createNewGame(73)));
delete legacy.state.mode;
delete legacy.state.heroOrder;
for (const id of HERO_ORDER.slice(8)) delete legacy.state.heroes[id];
legacy.state.heroes.hero_guard.level = 17;
legacy.state.resources.gold = 12345;
const imported = validateImport(legacy);
assert.ok(imported.ok && imported.state);
assert.equal(imported.state.mode, 'endless');
assert.equal(imported.state.heroes.hero_guard.level, 17);
assert.equal(imported.state.resources.gold, 12345);
assert.equal(Object.keys(imported.state.heroes).length, 24);
assert.equal(new Set(imported.state.heroOrder).size, 24);
assert.ok(imported.state.heroOrder.slice(0, 12).every(id => HEROES[id].melee));
const roster = new Simulation(imported.state);
roster.state.resources.recruitTickets = 23;
for (let i = 0; i < 23; i++) assert.equal(roster.recruit().ok, true);
assert.ok(HERO_ORDER.every((id) => roster.state.heroes[id].owned));

for (const top of [10, 300, 600, 10_000]) {
  const sim = gateFixture(top);
  for (let i = 0; i < 5; i++) sim.step(0.05);
  assert.equal(sim.state.maxFloorUnlocked, top + 10);
  assert.equal(sim.state.highestClearedFloor, top);
  assert.ok(isFloorCleared(sim.state, top));
  assert.equal(sim.setGoldFloor(1).ok, true);
  assert.ok(sim.state.floors[1].firstClearRewarded);
  const saved = JSON.stringify(sim.state);
  assert.ok(saved.length < 100_000, 'Completed history should remain compact');
  assert.ok(validateImport({ state: JSON.parse(saved) }).ok);
  checkFinite(sim.state);
}

const classic = gateFixture(300, 'classic');
classic.step(0.1);
assert.equal(classic.state.maxFloorUnlocked, 300);
assert.equal(classic.unlockNextSegment().ok, false);
assert.equal(classic.setMode('endless').ok, true);
assert.equal(classic.state.maxFloorUnlocked, 310);
assert.equal(classic.setMode('classic').ok, false);

const levels = createNewGame();
levels.resources.gold = Number.MAX_SAFE_INTEGER;
levels.heroes.hero_guard.level = 200;
const leveling = new Simulation(levels);
assert.equal(leveling.upgradeHero('hero_guard', 1).ok, true);
assert.equal(levels.heroes.hero_guard.level, 201);
levels.heroes.hero_guard.level = 10_000;
checkFinite(heroStatsOf(levels, 'hero_guard'));
checkFinite([monsterHpAt(10_000, 1), monsterAtkAt(10_000, 1), monsterGoldAt(10_000),
  heroUpgradeCost(10_000, 25), squireUpgradeCost(10_000)]);

console.log('Endless progression, classic cap, legacy saves, roster, and high-floor growth passed.');
