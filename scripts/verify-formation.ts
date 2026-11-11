import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, heroStatsOf, makeFloor, makeUnit, normalizeHeroOrder, squireStatsOf } from '../src/game/core/state';
import type { GameState } from '../src/game/core/types';
import { BALANCE } from '../src/game/data/economy';
import { HEROES, HERO_ORDER } from '../src/game/data/heroes';

function step(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / BALANCE.tick); i++) sim.step(BALANCE.tick);
}

function addHero(state: GameState, id: string, x: number) {
  const hero = state.heroes[id];
  hero.owned = true;
  hero.enabled = true;
  const unit = makeUnit(state, 'hero', id, 1, 'ally', x, heroStatsOf(state, id));
  unit.skillCooldown = 10_000;
  state.units.push(unit);
  return unit;
}

const stationaryStats = {
  hp: 1_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
};

const defaultOrder = normalizeHeroOrder(undefined);
const split = defaultOrder.findIndex((id) => !HEROES[id].melee);
assert.ok(defaultOrder.slice(0, split).every((id) => HEROES[id].melee));
assert.ok(defaultOrder.slice(split).every((id) => !HEROES[id].melee));
assert.deepEqual(normalizeHeroOrder(['hero_archer', 'unknown', 'hero_archer']), [
  'hero_archer', ...defaultOrder.filter((id) => id !== 'hero_archer'),
]);

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  const archer = addHero(state, 'hero_archer', 350);
  const guard = addHero(state, 'hero_guard', 250);
  state.units.push(makeUnit(state, 'enemy', 'enemy_bone_soldier', 1, 'enemy', 950, stationaryStats));
  const sim = new Simulation(state);
  sim.setHeroOrder(['hero_guard', 'hero_archer']);
  step(sim, 4);
  assert.ok(guard.x - archer.x >= 52.79, 'distant enemies do not prevent a formation change before combat');
}

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  const archer = addHero(state, 'hero_archer', 500);
  const guard = addHero(state, 'hero_guard', 280);
  state.heroOrder = normalizeHeroOrder(['hero_archer', 'hero_guard']);
  const sim = new Simulation(state);
  guard.hp -= 13;
  guard.attackCooldown = 0.7;
  const original = structuredClone(guard);
  assert.ok(sim.setHeroOrder(['hero_guard', 'hero_archer']).ok);
  assert.deepEqual(guard, original, 'changing the order does not reset or teleport existing heroes');
  step(sim, 15);
  assert.equal(guard.x, 620);
  assert.ok(guard.x - archer.x >= 52.79);
}

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  const guard = addHero(state, 'hero_guard', 360);
  const archer = addHero(state, 'hero_archer', 390);
  for (const u of [guard, archer]) {
    u.phase = 'dead';
    u.hp = 0;
    u.respawnAt = 0;
  }
  const sim = new Simulation(state);
  sim.setHeroOrder(['hero_archer', 'hero_guard']);
  step(sim, 3);
  const revivals = sim.events.filter((e) => e.type === 'hero_respawn');
  assert.deepEqual(revivals.map((e) => e.heroId), ['hero_archer', 'hero_guard']);
  assert.ok(revivals[1].at - revivals[0].at >= 1);
  assert.ok(archer.x - guard.x >= 52.79);
}

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  const guard = addHero(state, 'hero_guard', 500);
  const archer = addHero(state, 'hero_archer', 584);
  archer.moveSpeed = 0;
  const monster = makeUnit(state, 'enemy', 'enemy_moss_blob', 1, 'enemy', 660, stationaryStats);
  state.units.push(monster);
  const sim = new Simulation(state);
  step(sim, 5);
  assert.equal(guard.phase, 'attacking');
  assert.ok(guard.x - archer.x >= 52.79, 'a ranged ally that cannot step aside does not block melee');
  assert.equal(monster.x, 660);
}

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  const archer = addHero(state, 'hero_archer', 432);
  const guard = addHero(state, 'hero_guard', 350);
  const monster = makeUnit(state, 'enemy', 'enemy_bone_soldier', 1, 'enemy', 540, stationaryStats);
  const turret = makeUnit(state, 'turret', 'unit_copper_turret', 1, 'ally', 478, { ...stationaryStats, range: 260 });
  turret.expireAt = 10_000;
  state.units.push(monster, turret);
  const sim = new Simulation(state);
  step(sim, 13);
  assert.equal(guard.phase, 'attacking');
  assert.ok(guard.x - turret.x >= 45.59 && guard.x - archer.x >= 52.79);
  assert.equal(monster.x, 540, 'friendly separation does not push the enemy through the fight');
}

{
  const state = createNewGame(12);
  state.floors[1].challenge = 'cleared';
  state.heroes.hero_guard.enabled = false;
  const duelist = addHero(state, 'hero_assassin', 260);
  duelist.skillCooldown = 0;
  const monster = makeUnit(state, 'enemy', 'enemy_bone_soldier', 1, 'enemy', 600, stationaryStats);
  state.units.push(monster);
  const sim = new Simulation(state);
  step(sim, 0.5);
  assert.equal(duelist.skillCooldown, 0, 'out-of-range strike does not use a cooldown');
  assert.equal(monster.hp, monster.maxHp);
  step(sim, 7);
  assert.ok(sim.events.some((e) => e.type === 'hero_skill' && e.heroId === 'hero_assassin'));
}

{
  const state = createNewGame(12);
  state.heroes.hero_guard.enabled = false;
  state.floors[1].challenge = 'cleared';
  const guard = addHero(state, 'hero_guard', 200);
  guard.attackCooldown = 1;
  state.units.push(makeUnit(state, 'enemy', 'enemy_snow_wisp', 1, 'enemy', 450, {
    ...stationaryStats, range: 270,
  }));
  const sim = new Simulation(state);
  step(sim, 0.05);
  assert.equal(guard.slowFactor, 0.25);
  const cooldown = guard.attackCooldown;
  step(sim, 0.05);
  assert.ok(Math.abs(cooldown - guard.attackCooldown - BALANCE.tick * 0.75) < 0.000001);
}

{
  const state = createNewGame(12);
  state.heroes.hero_guard.enabled = false;
  state.floors[1] = makeFloor(1, true, true);
  state.floors[2] = makeFloor(2, true, true);
  const arriving = makeUnit(state, 'squire', 'unit_summon_squire', 1, 'ally', 920, squireStatsOf(state));
  const ahead = makeUnit(state, 'squire', 'unit_summon_squire', 2, 'ally', 60, squireStatsOf(state));
  state.units.push(arriving, ahead);
  const sim = new Simulation(state);
  step(sim, 0.05);
  assert.equal(arriving.floorId, 1, 'stair waits for destination entrance to clear');
  step(sim, 1.25);
  assert.equal(arriving.floorId, 2);
  assert.ok(ahead.x - arriving.x >= 43.19);
}

{
  const state = createNewGame(12);
  state.heroes.hero_guard.enabled = false;
  const floor = state.floors[1];
  floor.challenge = 'active';
  floor.currentWave = 0;
  const wave = { index: 0, monsterId: 'enemy_bone_soldier', total: 2, remainingSpawns: 1, alive: 1, nextSpawnAt: 0, done: false };
  floor.waves = [wave];
  const monster = makeUnit(state, 'enemy', wave.monsterId, 1, 'enemy', 940, stationaryStats);
  state.units.push(monster);
  const sim = new Simulation(state);
  step(sim, 0.5);
  assert.equal(wave.remainingSpawns, 1, 'enemy waits at a blocked spawn instead of stacking');
  monster.x = 880;
  step(sim, 0.05);
  assert.equal(wave.remainingSpawns, 0);
  assert.ok(state.units.some((u) => u.id !== monster.id && u.team === 'enemy'));
}

{
  const state = createNewGame(12);
  for (let f = 1; f <= 3; f++) state.floors[f] = makeFloor(f, true, true);
  for (const hero of Object.values(state.heroes)) {
    hero.owned = true;
    hero.enabled = true;
  }
  state.summon.inventory = state.summon.inventoryMax = 100;
  const sim = new Simulation(state);
  sim.setAutoSummon(true, 1);
  const deployments: unknown[] = [];
  const overlapTicks = new Map<string, number>();
  let peak = 0;
  let highestOccupiedFloor = 0;
  for (let i = 0; i < 3_600; i++) {
    const previous = new Map(state.units.map((u) => [u.id, { x: u.x, floor: u.floorId }]));
    sim.step(BALANCE.tick);
    deployments.push(...sim.events.filter((e) => e.type === 'hero_deployed').map((e) => e.heroId));
    sim.events.length = 0;
    const live = state.units.filter((u) => u.phase !== 'dead');
    const party = live.filter((u) => u.team === 'ally' && u.kind !== 'turret');
    peak = Math.max(peak, party.length);
    highestOccupiedFloor = Math.max(highestOccupiedFloor, ...party.map((u) => u.floorId));
    const near = new Set<string>();
    for (let a = 0; a < live.length; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const left = live[a];
        const right = live[b];
        if (left.floorId !== right.floorId) continue;
        const delta = left.x - right.x;
        const beforeLeft = previous.get(left.id);
        const beforeRight = previous.get(right.id);
        if (left.team !== right.team && beforeLeft?.floor === left.floorId && beforeRight?.floor === right.floorId) {
          assert.ok((beforeLeft.x - beforeRight.x) * delta >= -0.001, 'opposing units do not pass through each other');
        }
        if (left.team === right.team && Math.abs(delta) < 8) {
          const pair = `${left.id}:${right.id}`;
          near.add(pair);
          const ticks = (overlapTicks.get(pair) ?? 0) + 1;
          overlapTicks.set(pair, ticks);
          assert.ok(ticks < 20, 'allied passing resolves within one second instead of forming a lasting stack');
        }
      }
    }
    for (const pair of overlapTicks.keys()) {
      if (!near.has(pair)) overlapTicks.delete(pair);
    }
  }
  assert.equal(peak, HERO_ORDER.length + state.summon.aliveMax);
  assert.ok(highestOccupiedFloor >= 4);
  assert.deepEqual(deployments, state.heroOrder);
}

console.log('Hero order, respawn, melee passing, attack range, portal spacing and full-roster formation passed.');
