import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, makeFloor, makeUnit, normalizeGameState } from '../src/game/core/state';
import type { GameState, UnitKind, UnitState } from '../src/game/core/types';
import { BALANCE } from '../src/game/data/economy';

const DT = BALANCE.tick;

function setup() {
  const state = createNewGame(31415);
  state.time = 12;
  state.heroDeployAt = 10_000;
  for (let floor = 1; floor < 10; floor++) state.floors[floor] = makeFloor(floor, true, true);
  return new Simulation(state);
}

function unit(sim: Simulation, kind: UnitKind, floorId: number, x = 200, team: UnitState['team'] = kind === 'enemy' ? 'enemy' : 'ally', templateId?: string) {
  const created = makeUnit(sim.state, kind,
    templateId ?? (kind === 'hero' ? 'hero_guard' : kind === 'squire' ? 'unit_summon_squire'
      : kind === 'turret' ? 'unit_copper_turret' : 'enemy_moss_blob'), floorId, team, x, {
      hp: 100_000, atk: 20, def: 0, attackInterval: 1000, range: 60,
      moveSpeed: 40, critChance: 0, critMult: 1.5,
    });
  created.skillCooldown = 1000;
  created.attackCooldown = 1000;
  sim.state.units.push(created);
  return created;
}

function close(actual: number, expected: number, description: string) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${description}: expected ${expected}, got ${actual}`);
}

function advance(sim: Simulation, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / DT); tick++) sim.step(DT);
}

function verifyGlobalScopeAndNonHeroes() {
  const sim = setup();
  const first = unit(sim, 'hero', 1);
  const second = unit(sim, 'hero', 2);
  const squire = unit(sim, 'squire', 3);
  const turret = unit(sim, 'turret', 4);
  const enemy = unit(sim, 'enemy', 5, 700);
  const hostileHero = unit(sim, 'hero', 6, 700, 'enemy');
  const dead = unit(sim, 'hero', 7);
  dead.hp = 0;
  dead.phase = 'dead';
  dead.respawnAt = 10_000;
  const zeroHealth = unit(sim, 'hero', 8);
  zeroHealth.hp = 0;
  const result = sim.useActiveSkill('rapidAdvance');
  assert.equal(result.ok, true);
  const event = result.events.find((event) => event.type === 'active_skill')!;
  assert.equal(event.scope, 'allHeroes');
  assert.equal(event.duration, 10);
  assert.equal(event.affectedCount, 2);
  assert.equal(event.totalAmount, 0);
  assert.deepEqual(event.targets, [first, second].map((hero) => ({
    unitId: hero.id, floorId: hero.floorId, x: hero.x / BALANCE.floorLogicalWidth, amount: 0,
  })), 'feedback includes each affected hero and its actual floor');
  sim.state.units = sim.state.units.filter((candidate) => candidate !== zeroHealth);
  sim.step(DT);
  for (const hero of [first, second]) {
    close(hero.x, 204, 'heroes on different floors both move at double speed');
    assert.equal(hero.moveSpeed, 40, 'the base movement stat is never modified');
    close(hero.attackCooldown, 1000 - DT, 'the skill does not accelerate attack cooldowns');
    assert.equal(hero.attackInterval, 1000);
  }
  close(squire.x, 202, 'squires retain their normal movement');
  close(turret.x, 200, 'turrets retain their normal stationary behavior');
  close(enemy.x, 698, 'enemies retain their normal movement');
  close(hostileHero.x, 698, 'the buff requires the allied team as well as hero kind');
  assert.equal(dead.x, 200, 'dead heroes are not moved');
}

function verifyMovementPaths() {
  const chase = setup();
  const chasingHero = unit(chase, 'hero', 1);
  const target = unit(chase, 'enemy', 1, 800);
  target.moveSpeed = 0;
  chase.useActiveSkill('rapidAdvance');
  chase.step(DT);
  close(chasingHero.x, 204, 'chasing an out-of-range enemy uses boosted movement');

  const yieldSim = setup();
  const ranged = unit(yieldSim, 'hero', 1, 600, 'ally', 'hero_archer');
  ranged.range = 300;
  ranged.combatLane = 0;
  const melee = unit(yieldSim, 'squire', 1, 520);
  melee.combatLane = 0;
  const opponent = unit(yieldSim, 'enemy', 1, 680);
  opponent.moveSpeed = 0;
  yieldSim.useActiveSkill('rapidAdvance');
  yieldSim.step(DT);
  close(ranged.x, 596, 'a ranged hero yielding space to melee also moves at double speed');
  close(melee.x, 522, 'the accompanying squire is not accelerated');

  const stairs = setup();
  const climbing = unit(stairs, 'hero', 1, 914);
  stairs.useActiveSkill('rapidAdvance');
  stairs.step(DT);
  assert.equal(climbing.floorId, 2, 'accelerated heroes still use the normal staircase transition');
  assert.equal(climbing.x, 60, 'floor transitions retain the normal entry coordinate');

  const formation = setup();
  const leader = unit(formation, 'hero', 1, 400);
  const follower = unit(formation, 'hero', 1, 200, 'ally', 'hero_assassin');
  leader.combatLane = follower.combatLane = 0;
  formation.useActiveSkill('rapidAdvance');
  formation.step(DT);
  close(leader.x, 404, 'the formation leader accelerates');
  close(follower.x, 204, 'following a formation target also accelerates');
}

function verifySlowAndAttackIndependence() {
  const sim = setup();
  const hero = unit(sim, 'hero', 1);
  hero.slowFactor = 0.25;
  hero.slowUntil = sim.state.time + 2;
  sim.useActiveSkill('rapidAdvance');
  sim.step(DT);
  close(hero.x, 203, 'speed boost multiplies the existing slow: 40 * 2 * 0.75');
  close(hero.attackCooldown, 1000 - DT * 0.75, 'the existing attack slow remains independent of movement boost');
  const before = hero.x;
  hero.slowUntil = sim.state.time;
  sim.step(DT);
  close(hero.x - before, 4, 'normal boosted speed resumes when slow expires');
  assert.equal(hero.moveSpeed, 40);
}

function verifyLateDeploymentAndRespawn() {
  const sim = setup();
  const result = sim.useActiveSkill('rapidAdvance');
  assert.equal(result.ok, true, 'an empty battlefield can receive the global buff');
  assert.equal(result.events.find((event) => event.type === 'active_skill')?.affectedCount, 0);
  assert.equal(sim.state.activeSkills.rapidAdvanceCooldown, 30);
  sim.state.heroDeployAt = sim.state.time;
  sim.step(DT);
  const deployed = sim.state.units.find((candidate) => candidate.kind === 'hero')!;
  assert.ok(deployed, 'the normal deploy queue introduces a hero after the cast');
  close(deployed.x, 60 + deployed.moveSpeed * 2 * DT, 'a hero deployed later inherits the remaining global boost');
  deployed.hp = 0;
  deployed.phase = 'dead';
  deployed.respawnAt = sim.state.time;
  sim.state.heroDeployAt = sim.state.time;
  sim.step(DT);
  assert.notEqual(deployed.phase, 'dead', 'the normal respawn system restores the hero');
  close(deployed.x, 60 + deployed.moveSpeed * 2 * DT, 'a respawned hero also inherits the remaining global boost');
}

function verifyExpirationAndCooldown() {
  const sim = setup();
  const hero = unit(sim, 'hero', 1);
  sim.useActiveSkill('rapidAdvance');
  const until = sim.state.activeSkills.rapidAdvanceUntil;
  const firstCooldown = sim.state.activeSkills.rapidAdvanceCooldown;
  assert.equal(until, sim.state.time + 10);
  assert.equal(sim.useActiveSkill('rapidAdvance').ok, false, 'an immediate repeat is rejected');
  assert.equal(sim.state.activeSkills.rapidAdvanceUntil, until, 'a rejected repeat cannot extend the effect');
  assert.equal(sim.state.activeSkills.rapidAdvanceCooldown, firstCooldown);
  advance(sim, 10.1);
  assert.equal(sim.state.activeSkills.rapidAdvanceUntil, 0, 'expired global buffs are cleared');
  close(sim.state.activeSkills.rapidAdvanceCooldown, 19.9, 'effect duration and cooldown elapse separately');
  hero.floorId = 1;
  hero.x = 200;
  sim.step(DT);
  close(hero.x, 202, 'movement returns to its unchanged base speed after expiration');
  assert.equal(sim.useActiveSkill('rapidAdvance').ok, false, 'expiration does not prematurely reset cooldown');
  advance(sim, 20);
  assert.equal(sim.state.activeSkills.rapidAdvanceCooldown, 0);
  assert.equal(sim.useActiveSkill('rapidAdvance').ok, true, 'the skill can be cast after the full cooldown');
}

function verifySaveMigrationAndReplay() {
  const legacy = setup().state;
  delete (legacy.activeSkills as Partial<typeof legacy.activeSkills>).rapidAdvanceCooldown;
  delete (legacy.activeSkills as Partial<typeof legacy.activeSkills>).rapidAdvanceUntil;
  normalizeGameState(legacy);
  assert.equal(legacy.activeSkills.rapidAdvanceCooldown, 0);
  assert.equal(legacy.activeSkills.rapidAdvanceUntil, 0);
  for (const invalid of [undefined, NaN, Infinity, -1, '10']) {
    const state = setup().state;
    Object.assign(state.activeSkills, { rapidAdvanceCooldown: invalid, rapidAdvanceUntil: invalid });
    normalizeGameState(state);
    assert.equal(state.activeSkills.rapidAdvanceCooldown, 0, 'invalid saved cooldown values reset safely');
    assert.equal(state.activeSkills.rapidAdvanceUntil, 0, 'invalid saved expiration values reset safely');
  }
  const excessive = setup().state;
  excessive.activeSkills.rapidAdvanceCooldown = 999;
  excessive.activeSkills.rapidAdvanceUntil = 999;
  normalizeGameState(excessive);
  assert.equal(excessive.activeSkills.rapidAdvanceCooldown, 30, 'saved cooldown cannot exceed its configured maximum');
  assert.equal(excessive.activeSkills.rapidAdvanceUntil, excessive.time + 10, 'saved duration cannot exceed its configured maximum');

  const sim = setup();
  unit(sim, 'hero', 1);
  unit(sim, 'hero', 2);
  sim.useActiveSkill('rapidAdvance');
  advance(sim, 3);
  const saved = JSON.parse(JSON.stringify(sim.state)) as GameState;
  const restored = new Simulation(saved);
  assert.deepEqual(restored.state.activeSkills, sim.state.activeSkills, 'reload preserves remaining cooldown and the original expiry');
  for (let tick = 0; tick < 9 / DT; tick++) {
    sim.step(DT);
    restored.step(DT);
    assert.deepEqual(restored.state.units, sim.state.units, 'saved and live movement remain identical across expiry and floor transitions');
    assert.deepEqual(restored.state.activeSkills, sim.state.activeSkills, 'reload does not extend or shorten timers');
  }
  assert.equal(restored.state.activeSkills.rapidAdvanceUntil, 0);
}

verifyGlobalScopeAndNonHeroes();
verifyMovementPaths();
verifySlowAndAttackIndependence();
verifyLateDeploymentAndRespawn();
verifyExpirationAndCooldown();
verifySaveMigrationAndReplay();
console.log('Rapid advance scope, movement paths, slow stacking, deployment, respawn, cooldown and save compatibility passed.');
