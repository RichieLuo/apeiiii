import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, heroStatsOf, makeFloor, makeUnit, squireStatsOf } from '../src/game/core/state';
import type { GameState, UnitState } from '../src/game/core/types';
import { BALANCE } from '../src/game/data/economy';

function verifySaveReplay(sim: Simulation, seconds: number) {
  const saved = JSON.parse(JSON.stringify(sim.state)) as GameState;
  const restored = new Simulation(saved);
  sim.events.length = 0;
  for (let tick = 0; tick < seconds / BALANCE.tick; tick++) {
    sim.step(BALANCE.tick);
    restored.step(BALANCE.tick);
    assert.deepEqual(restored.state.units, sim.state.units, 'saving and reloading preserves melee lanes, movement, attacks and damage');
    // RNG 恢复会把有符号的位运算结果规范成 uint32；比较相同的 32 位状态。
    assert.deepEqual(Object.values(restored.state.rng).map((value) => value >>> 0),
      Object.values(sim.state.rng).map((value) => value >>> 0), 'saving and reloading preserves combat randomness');
    assert.deepEqual(restored.events, sim.events, 'saving and reloading produces the same combat events');
    sim.events.length = 0;
    restored.events.length = 0;
  }
}

function verifyMeleeParty(kind: 'enemy' | 'boss') {
  const state = createNewGame(42);
  state.floors[1] = makeFloor(1, true, true);
  state.heroDeployAt = 10_000;
  state.summon.autoEnabled = false;
  const guard = makeUnit(state, 'hero', 'hero_guard', 1, 'ally', 500, heroStatsOf(state, 'hero_guard'));
  const party = [guard];
  for (let i = 0; i < 5; i++) {
    party.push(makeUnit(state, 'squire', 'unit_summon_squire', 1, 'ally', 440 - i * 48, squireStatsOf(state)));
  }
  const enemyX = 660;
  const enemy = makeUnit(state, kind, kind === 'boss' ? 'boss_gate_colossus' : 'enemy_moss_blob', 1, 'enemy', enemyX, {
    hp: 1_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  for (const unit of [...party, enemy]) unit.skillCooldown = 10_000;
  enemy.attackCooldown = 10_000;
  state.units.push(...party, enemy);
  const sim = new Simulation(state);
  const attacks = new Map<number, number>();
  let peakEngaged = 0;
  let sustainedEngagementTicks = 0;

  for (let tick = 0; tick < 30 / BALANCE.tick; tick++) {
    const cooldowns = new Map(party.map((unit) => [unit.id, unit.attackCooldown]));
    sim.step(BALANCE.tick);
    const engaged: UnitState[] = [];
    for (const unit of party) {
      assert.equal(unit.phase === 'dead', false, `${kind}: the controlled test party survives`);
      assert.ok(unit.x < enemy.x, `${kind}: melee units cannot cross through the enemy`);
      if (unit.phase === 'attacking') engaged.push(unit);
      if (unit.attackCooldown > cooldowns.get(unit.id)! + 0.01) {
        assert.ok(Math.abs(unit.x - enemy.x) <= unit.range + 0.001, `${kind}: melee must reach its actual attack range before damaging`);
        attacks.set(unit.id, (attacks.get(unit.id) ?? 0) + 1);
      }
    }
    assert.ok(Math.abs(enemy.x - enemyX) < 0.001, `${kind}: the party cannot push a stationary enemy along the floor`);
    peakEngaged = Math.max(peakEngaged, engaged.length);
    if (engaged.length >= 3) sustainedEngagementTicks++;
    sim.events.length = 0;
  }

  const repeatedAttackers = party.filter((unit) => (attacks.get(unit.id) ?? 0) >= 3);
  console.log(`${kind}: ${attacks.size}/${party.length} melee units attacked, ${repeatedAttackers.length} attacked repeatedly, peak engaged ${peakEngaged}`);
  assert.ok(enemy.hp < enemy.maxHp, `${kind}: attacks must deal real damage`);
  assert.ok(peakEngaged >= 3, `${kind}: at least three melee units can engage together instead of only the leader`);
  assert.ok(sustainedEngagementTicks * BALANCE.tick >= 3, `${kind}: simultaneous melee engagement lasts beyond a passing collision`);
  assert.ok(repeatedAttackers.length >= 3, `${kind}: at least three melee units keep attacking, rather than briefly entering attack animation`);

  verifySaveReplay(sim, 3);
  const front = party.filter((unit) => unit.phase === 'attacking');
  assert.equal(front.length, 3, `${kind}: each of the three lanes has one short-range front attacker`);
  assert.equal(new Set(front.map((unit) => sim.meleeLane(unit))).size, 3, `${kind}: simultaneous attackers occupy distinct lanes`);
  const reserve = party.filter((unit) => !front.includes(unit));
  const reserveLanes = new Map(reserve.map((unit) => [unit.id, sim.meleeLane(unit)]));
  for (const unit of front) {
    unit.hp = 0;
    unit.phase = 'dead';
    if (unit.kind === 'hero') unit.respawnAt = 10_000;
  }
  const reserveAttacks = new Map<number, number>();
  for (let tick = 0; tick < 10 / BALANCE.tick; tick++) {
    const cooldowns = new Map(reserve.map((unit) => [unit.id, unit.attackCooldown]));
    sim.step(BALANCE.tick);
    for (const unit of reserve) {
      assert.equal(sim.meleeLane(unit), reserveLanes.get(unit.id), `${kind}: a death does not shuffle surviving units between lanes`);
      assert.ok(unit.x < enemy.x, `${kind}: reserves cannot pass through the enemy`);
      if (unit.attackCooldown > cooldowns.get(unit.id)! + 0.01) {
        assert.ok(Math.abs(unit.x - enemy.x) <= unit.range + 0.001, `${kind}: reserves must approach before attacking`);
        reserveAttacks.set(unit.id, (reserveAttacks.get(unit.id) ?? 0) + 1);
      }
    }
    assert.ok(Math.abs(enemy.x - enemyX) < 0.001, `${kind}: replacing the frontline cannot push the enemy`);
    sim.events.length = 0;
  }
  assert.ok(reserve.every((unit) => (reserveAttacks.get(unit.id) ?? 0) >= 3), `${kind}: all three reserves advance and attack repeatedly after the frontline dies`);
  verifySaveReplay(sim, 3);
}

function verifyMixedMeleeSkills() {
  const state = createNewGame(73);
  state.floors[1] = makeFloor(1, true, true);
  state.heroDeployAt = 10_000;
  const heroes = ['hero_guard', 'hero_assassin', 'hero_hammer'].map((id, index) => {
    state.heroes[id].owned = true;
    state.heroes[id].enabled = true;
    const unit = makeUnit(state, 'hero', id, 1, 'ally', 500 - index * 60, heroStatsOf(state, id));
    unit.skillCooldown = id === 'hero_guard' ? 10_000 : 0;
    return unit;
  });
  const reserves = Array.from({ length: 3 }, (_, index) =>
    makeUnit(state, 'squire', 'unit_summon_squire', 1, 'ally', 320 - index * 48, squireStatsOf(state)));
  const enemy = makeUnit(state, 'enemy', 'enemy_moss_blob', 1, 'enemy', 660, {
    hp: 1_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  enemy.attackCooldown = 10_000;
  state.units.push(...heroes, ...reserves, enemy);
  const sim = new Simulation(state);
  const skillUses = new Map<string, number>();
  const attacks = new Map<number, number>();
  for (let tick = 0; tick < 30 / BALANCE.tick; tick++) {
    const cooldowns = new Map(heroes.map((unit) => [unit.id, unit.attackCooldown]));
    sim.step(BALANCE.tick);
    for (const unit of [...heroes, ...reserves]) {
      assert.ok(unit.x < enemy.x, 'mixed melee heroes and squires cannot pass through the enemy');
    }
    for (const hero of heroes) {
      if (hero.attackCooldown > cooldowns.get(hero.id)! + 0.01) {
        assert.ok(Math.abs(hero.x - enemy.x) <= hero.range + 0.001, 'mixed heroes must be in range to attack');
        attacks.set(hero.id, (attacks.get(hero.id) ?? 0) + 1);
      }
      const uses = sim.events.filter((event) => event.type === 'hero_skill' && event.heroId === hero.templateId);
      if (uses.length > 0) {
        assert.ok(Math.abs(hero.x - enemy.x) <= hero.range + 0.001, 'melee attack skills cannot hit from a distant lane queue');
        skillUses.set(hero.templateId, (skillUses.get(hero.templateId) ?? 0) + uses.length);
      }
    }
    if (tick < 1 / BALANCE.tick) {
      assert.equal(enemy.hp, enemy.maxHp, 'a distant party cannot attack immediately when combat lanes are assigned');
      assert.equal(heroes[1].skillCooldown, 0, 'an out-of-range assassin keeps its attack skill ready');
      assert.equal(heroes[2].skillCooldown, 0, 'an out-of-range hammer hero keeps its area skill ready');
    }
    assert.ok(Math.abs(enemy.x - 660) < 0.001, 'mixed melee heroes cannot push the stationary enemy');
    sim.events.length = 0;
  }
  assert.ok(heroes.every((hero) => (attacks.get(hero.id) ?? 0) >= 3), 'all three different melee heroes must contribute sustained attacks');
  for (const id of ['hero_assassin', 'hero_hammer']) {
    assert.ok((skillUses.get(id) ?? 0) >= 2, `${id}: repeated attack skills must work after approaching through its combat lane`);
  }
  verifySaveReplay(sim, 5);
}

function verifyPostCombatMarch() {
  const state = createNewGame(91);
  state.floors[1] = makeFloor(1, true, true);
  state.heroDeployAt = 10_000;
  const heroes = ['hero_guard', 'hero_assassin', 'hero_hammer'].map((id) => {
    state.heroes[id].owned = true;
    state.heroes[id].enabled = true;
    const unit = makeUnit(state, 'hero', id, 1, 'ally', 600, heroStatsOf(state, id));
    // 相同速度用于隔离阵型逻辑，避免自然速度差掩盖被强制收回单列的问题。
    unit.moveSpeed = 48;
    unit.skillCooldown = 10_000;
    return unit;
  });
  const enemy = makeUnit(state, 'enemy', 'enemy_moss_blob', 1, 'enemy', 660, {
    hp: 1_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  enemy.attackCooldown = 10_000;
  state.units.push(...heroes, enemy);
  const sim = new Simulation(state);
  sim.step(BALANCE.tick);
  assert.ok(heroes.every((hero) => hero.phase === 'attacking'), 'all three lanes are engaged before the last enemy dies');
  const lanes = new Map(heroes.map((hero) => [hero.id, sim.meleeLane(hero)]));
  assert.equal(new Set(lanes.values()).size, 3, 'the pre-clear formation occupies three distinct lanes');
  enemy.hp = 0;
  enemy.phase = 'dead';
  for (let tick = 0; tick < 4 / BALANCE.tick; tick++) {
    const before = new Map(heroes.map((hero) => [hero.id, hero.x]));
    sim.step(BALANCE.tick);
    for (const hero of heroes) {
      assert.equal(sim.meleeLane(hero), lanes.get(hero.id), 'clearing the floor preserves each melee lane');
      assert.equal(hero.floorId, 1, 'the measured march stays below the staircase');
      assert.ok(Math.abs(hero.x - before.get(hero.id)! - hero.moveSpeed * BALANCE.tick) < 0.001,
        'each melee lane advances toward the staircase without being pushed backward into one line');
    }
    const positions = heroes.map((hero) => hero.x);
    assert.ok(Math.max(...positions) - Math.min(...positions) < 1,
      'different melee lanes can march shoulder to shoulder without forced horizontal spacing');
    sim.events.length = 0;
  }
  verifySaveReplay(sim, 1);
}

function verifyBlockedEntrance() {
  const state = createNewGame(101);
  state.floors[1] = makeFloor(1, true, true);
  state.heroDeployAt = 10_000;
  const enemy = makeUnit(state, 'enemy', 'enemy_moss_blob', 1, 'enemy', 132, {
    hp: 1_000_000, atk: 1, def: 0, attackInterval: 1, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  enemy.attackCooldown = 10_000;
  state.units.push(enemy);
  const sim = new Simulation(state);
  const attacks = new Map<number, number>();
  const checkStep = () => {
    const before = new Map(state.units.filter((unit) => unit.team === 'ally').map((unit) => [unit.id, unit.attackCooldown]));
    sim.step(BALANCE.tick);
    const party = state.units.filter((unit) => unit.team === 'ally');
    for (const unit of party) {
      assert.ok(unit.x < enemy.x, 'newly summoned melee cannot pass through a spawn-blocking enemy');
      if (unit.attackCooldown > before.get(unit.id)! + 0.01) {
        assert.ok(Math.abs(unit.x - enemy.x) <= unit.range + 0.001, 'newly summoned melee must be in range before attacking');
        attacks.set(unit.id, (attacks.get(unit.id) ?? 0) + 1);
      }
      for (const other of party) {
        if (unit.id >= other.id || sim.meleeLane(unit) !== sim.meleeLane(other)) continue;
        assert.ok(Math.abs(unit.x - other.x) >= 43.19, 'spawn-blocked melee never stack within the same lane');
      }
    }
    assert.ok(Math.abs(enemy.x - 132) < 0.001, 'reinforcements do not push away a spawn-blocking enemy');
    sim.events.length = 0;
  };
  for (let i = 0; i < 3; i++) {
    assert.equal(sim.spawnSquire(1).ok, true, `blocked entrance admits a melee reinforcement into free lane ${i + 1}`);
    for (let tick = 0; tick < 0.25 / BALANCE.tick; tick++) checkStep();
  }
  const party = state.units.filter((unit) => unit.team === 'ally');
  assert.equal(party.length, 3, 'all three melee lanes can enter during a blocked-entrance fight');
  assert.equal(new Set(party.map((unit) => sim.meleeLane(unit))).size, 3, 'reinforcements use three distinct entrance lanes');
  const inventory = state.summon.inventory;
  assert.equal(sim.spawnSquire(1).ok, false, 'a fourth reinforcement must wait while every entrance lane is occupied');
  assert.equal(state.summon.inventory, inventory, 'a blocked reinforcement does not consume inventory');
  for (let tick = 0; tick < 4 / BALANCE.tick; tick++) checkStep();
  assert.ok(party.every((unit) => (attacks.get(unit.id) ?? 0) >= 3), 'all admitted melee reinforcements repeatedly attack the blocking enemy');

  const quietState = createNewGame(102);
  quietState.floors[1] = makeFloor(1, true, true);
  quietState.heroDeployAt = 10_000;
  const quietSim = new Simulation(quietState);
  assert.equal(quietSim.spawnSquire(1).ok, true);
  for (let tick = 0; tick < 0.25 / BALANCE.tick; tick++) quietSim.step(BALANCE.tick);
  assert.equal(quietState.summon.spawnCooldown, 0, 'the quiet-entrance check is not blocked by the summon cooldown');
  assert.equal(quietSim.spawnSquire(1).ok, false, 'an entrance without enemies still waits for the preceding unit to move clear');
}

const failures: unknown[] = [];
for (const kind of ['enemy', 'boss'] as const) {
  try {
    verifyMeleeParty(kind);
  } catch (error) {
    failures.push(error);
  }
}
for (const verify of [verifyMixedMeleeSkills, verifyPostCombatMarch, verifyBlockedEntrance]) {
  try {
    verify();
  } catch (error) {
    failures.push(error);
  }
}
assert.equal(failures.length, 0, failures.map(String).join('\n'));
console.log('Melee engagement, frontline replacement, mixed hero skills, post-combat march, blocked entrance and deterministic save replay passed.');
