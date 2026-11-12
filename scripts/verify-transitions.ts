import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, heroStatsOf, makeFloor, makeUnit, normalizeHeroOrder, squireStatsOf } from '../src/game/core/state';
import type { GameState, UnitState } from '../src/game/core/types';
import { BALANCE } from '../src/game/data/economy';
import { HEROES, HERO_ORDER } from '../src/game/data/heroes';

const START_FLOOR = 101;
const ENEMY_X = 940;
const ORDER_VARIANTS = {
  meleeFirst: normalizeHeroOrder(undefined),
  rangedFirst: normalizeHeroOrder([...HERO_ORDER].sort((a, b) => Number(HEROES[a].melee) - Number(HEROES[b].melee))),
  reversed: normalizeHeroOrder([...HERO_ORDER].reverse()),
};

function corridor(frontline: number): GameState {
  const state = createNewGame(109);
  state.maxFloorUnlocked = 110;
  state.highestClearedFloor = frontline - 1;
  state.selectedFloor = frontline;
  state.floors = {};
  for (let floor = START_FLOOR; floor <= 110; floor++) {
    state.floors[floor] = makeFloor(floor, true, floor < frontline);
  }
  for (const hero of Object.values(state.heroes)) {
    hero.owned = true;
    hero.enabled = true;
  }
  // 固定前线，避免战斗提前清关/阵亡把行军堵塞掩盖掉。
  const floor = state.floors[frontline];
  floor.challenge = 'active';
  floor.currentWave = 0;
  floor.waves = [{ index: 0, monsterId: 'enemy_moss_blob', total: 1, remainingSpawns: 0, nextSpawnAt: 0, alive: 1, done: false }];
  const enemy = makeUnit(state, 'enemy', 'enemy_moss_blob', frontline, 'enemy', ENEMY_X, {
    hp: 1_000_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  enemy.attackCooldown = enemy.skillCooldown = 10_000;
  state.units.push(enemy);
  return state;
}

function addSquires(state: GameState) {
  const party: UnitState[] = [];
  for (let i = 0; i < state.summon.aliveMax; i++) {
    const unit = makeUnit(state, 'squire', 'unit_summon_squire', START_FLOOR, 'ally', 300 + Math.floor(i / 3) * 50, squireStatsOf(state));
    unit.combatLane = i % 3;
    party.push(unit);
    state.units.push(unit);
  }
  return party;
}

function simulateCorridor(sim: Simulation, seconds: number) {
  for (let tick = 0; tick < seconds / BALANCE.tick; tick++) {
    const previousFloors = new Map(sim.state.units.map((unit) => [unit.id, unit.floorId]));
    sim.step(BALANCE.tick);
    for (const unit of sim.state.units) {
      if (unit.team !== 'ally') continue;
      unit.skillCooldown = 10_000;
      const previousFloor = previousFloors.get(unit.id);
      if (previousFloor !== undefined) {
        assert.ok(unit.floorId >= previousFloor && unit.floorId <= previousFloor + 1, 'cleared-floor transit advances one staircase at a time');
      }
      assert.notEqual(unit.phase, 'dead', 'the controlled corridor cannot resolve congestion through party deaths');
      if (unit.floorId === sim.state.selectedFloor) assert.ok(unit.x < ENEMY_X, 'arriving allies cannot pass through the frontline enemy');
    }
    sim.events.length = 0;
  }
}

function describeWaiting(units: UnitState[], frontline: number) {
  return units.filter((unit) => unit.floorId < frontline)
    .map((unit) => `${unit.templateId}@${unit.floorId}:${Math.round(unit.x)}`).join(', ');
}

function verifyWholeRosterTransit(orderName: keyof typeof ORDER_VARIANTS, frontline: number) {
  const state = corridor(frontline);
  state.heroOrder = [...ORDER_VARIANTS[orderName]];
  const squires = addSquires(state);
  // 英雄走真实召唤流程，使入场位置和初始间距合法。
  const sim = new Simulation(state);
  simulateCorridor(sim, 300);
  const party = state.units.filter((unit) => unit.kind === 'hero' || unit.kind === 'squire');
  const arrived = party.filter((unit) => unit.floorId === frontline);
  console.log(`${orderName}, frontline ${frontline}: ${arrived.length}/${party.length} arrived; waiting: ${describeWaiting(party, frontline) || 'none'}`);
  assert.equal(party.length, HERO_ORDER.length + squires.length, 'the full roster deploys without losing any units');
  assert.ok(party.every((unit) => unit.floorId === frontline), `${orderName}: mobile units must not remain on cleared floors behind a ranged entrance queue`);
}

function verifySquiresNotStranded(reload = false) {
  const frontline = 109;
  let state = corridor(frontline);
  state.heroDeployAt = 10_000;
  let meleeIndex = 0;
  let rangedIndex = 0;
  for (const id of HERO_ORDER) {
    const melee = HEROES[id].melee;
    const x = melee ? 880 - Math.floor(meleeIndex / 3) * 54 : 641 - rangedIndex++ * 52.8;
    const unit = makeUnit(state, 'hero', id, frontline, 'ally', x, heroStatsOf(state, id));
    if (melee) unit.combatLane = meleeIndex++ % 3;
    unit.skillCooldown = 10_000;
    state.units.push(unit);
  }
  // 兼容旧存档：前线远程英雄还没有通道字段，重开后仍要允许增援上楼。
  if (reload) state = JSON.parse(JSON.stringify(state)) as GameState;
  const squires = addSquires(state);
  const sim = new Simulation(state);
  simulateCorridor(sim, 300);
  const stranded = squires.filter((unit) => unit.floorId < frontline);
  console.log(`squire reinforcements${reload ? ' after save reload' : ''}: ${squires.length - stranded.length}/${squires.length} arrived; summon status: ${sim.canSpawnSquire(frontline).reason ?? 'ready'}`);
  assert.equal(stranded.length, 0, 'the entire squire population must not remain below the frontline while occupying the alive limit');
}

function verifyStairwayOrder() {
  const state = corridor(109);
  state.heroDeployAt = 10_000;
  const ids = ['hero_archer', 'hero_guard', 'hero_assassin', 'hero_hammer'];
  state.heroOrder = normalizeHeroOrder(ids);
  const party = ids.map((id, index) => {
    const unit = makeUnit(state, 'hero', id, 108, 'ally', index === 0 ? 867.2 : 920, heroStatsOf(state, id));
    if (index > 0) unit.combatLane = index - 1;
    unit.skillCooldown = 10_000;
    state.units.push(unit);
    return unit;
  });
  const sim = new Simulation(state);
  simulateCorridor(sim, 20);
  assert.ok(party.every((unit) => unit.floorId === 109), 'later melee heroes at the staircase cannot permanently block an earlier ranged hero');
}

function verifyFourUnitDeadlock() {
  const state = createNewGame(6);
  state.heroDeployAt = 10_000;
  state.summon.autoEnabled = false;
  state.floors[1] = makeFloor(1, true, true);
  state.floors[2] = makeFloor(2, true, true);
  const guard = makeUnit(state, 'hero', 'hero_guard', 1, 'ally', 771.2, heroStatsOf(state, 'hero_guard'));
  guard.combatLane = 1;
  const ice = makeUnit(state, 'hero', 'hero_ice_mage', 1, 'ally', 824, heroStatsOf(state, 'hero_ice_mage'));
  const duelist = makeUnit(state, 'hero', 'hero_duelist', 1, 'ally', 920, heroStatsOf(state, 'hero_duelist'));
  duelist.combatLane = 0;
  const squire = makeUnit(state, 'squire', 'unit_summon_squire', 1, 'ally', 872, squireStatsOf(state));
  squire.combatLane = 0;
  const party = [guard, ice, duelist, squire];
  for (const unit of party) unit.skillCooldown = 10_000;
  state.units.push(...party);
  const sim = new Simulation(state);
  for (let tick = 0; tick < 15 / BALANCE.tick; tick++) {
    sim.step(BALANCE.tick);
    sim.events.length = 0;
  }
  console.log(`four-unit stairway: ${party.map((unit) => `${unit.templateId}@${unit.floorId}:${Math.round(unit.x)}`).join(', ')}`);
  assert.ok(party.every((unit) => unit.floorId >= 2),
    'the arriving duelist can use the stairs so that its squire, ranged teammate and earlier guard can follow');
}

function verifyBlockedEntryRelease() {
  const state = corridor(109);
  state.heroDeployAt = 10_000;
  const blockers = Array.from({ length: 3 }, (_, lane) => {
    const unit = makeUnit(state, 'squire', 'unit_summon_squire', 109, 'ally', 60, squireStatsOf(state));
    unit.combatLane = lane;
    unit.moveSpeed = 0;
    state.units.push(unit);
    return unit;
  });
  const arriving = makeUnit(state, 'squire', 'unit_summon_squire', 108, 'ally', 920, squireStatsOf(state));
  arriving.combatLane = 0;
  state.units.push(arriving);
  const sim = new Simulation(state);
  simulateCorridor(sim, 1);
  assert.equal(arriving.floorId, 108, 'an arrival waits while all destination entrance lanes are genuinely occupied');
  blockers[0].moveSpeed = BALANCE.squireMoveSpeed;
  for (let tick = 0; tick < 5 / BALANCE.tick; tick++) {
    sim.step(BALANCE.tick);
    if (arriving.floorId === 109) {
      for (const blocker of blockers) {
        if (arriving.combatLane !== blocker.combatLane) continue;
        assert.ok(Math.abs(arriving.x - blocker.x) >= 43.19, 'released arrivals preserve same-lane spacing at the destination');
      }
    }
    sim.events.length = 0;
  }
  assert.equal(arriving.floorId, 109, 'the queued arrival proceeds once one destination entrance lane clears');
}

const failures: unknown[] = [];
for (const verify of [
  () => verifyWholeRosterTransit('meleeFirst', 109),
  () => verifyWholeRosterTransit('rangedFirst', 109),
  () => verifyWholeRosterTransit('reversed', 109),
  () => verifyWholeRosterTransit('rangedFirst', 110),
  () => verifySquiresNotStranded(),
  () => verifySquiresNotStranded(true),
  verifyStairwayOrder,
  verifyFourUnitDeadlock,
  verifyBlockedEntryRelease,
]) {
  try {
    verify();
  } catch (error) {
    failures.push(error);
  }
}
assert.equal(failures.length, 0, failures.map(String).join('\n'));
console.log('Cleared-floor transit, mixed hero orders, frontline entrance and squire reinforcement regressions passed.');
