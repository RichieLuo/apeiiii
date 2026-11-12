import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, makeFloor, makeUnit } from '../src/game/core/state';
import type { DomainEvent, UnitState } from '../src/game/core/types';
import { BALANCE, monsterGoldAt } from '../src/game/data/economy';

function setup() {
  const state = createNewGame(2718);
  state.heroDeployAt = 10_000;
  state.time = 12;
  state.floors[1] = makeFloor(1, true, true);
  state.floors[2] = makeFloor(2, true, true);
  const sim = new Simulation(state);
  return { state, sim };
}

function addUnit(sim: Simulation, team: 'ally' | 'enemy', floorId = 1, hp = 100, x = team === 'ally' ? 500 : 550) {
  const unit = makeUnit(sim.state, team === 'ally' ? 'squire' : 'enemy',
    team === 'ally' ? 'unit_summon_squire' : 'enemy_moss_blob', floorId, team, x, {
      hp: 100, atk: 20, def: 0, attackInterval: 100, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
    });
  unit.hp = hp;
  unit.attackCooldown = 100;
  unit.skillCooldown = 100;
  sim.state.units.push(unit);
  return unit;
}

function activeEvent(events: DomainEvent[]) {
  const event = events.find((event) => event.type === 'active_skill');
  assert.ok(event, 'a successful cast reports its effect');
  return event;
}

function verifyEmptyCasts() {
  const { sim, state } = setup();
  assert.equal(sim.getActiveSkillTargetFloor(), 1, 'a fresh empty game targets floor 1, not the pre-unlocked floor 10');
  state.selectedFloor = 10;
  for (const skill of ['battleCry', 'lifeEcho', 'crystalRain'] as const) {
    const result = sim.useActiveSkill(skill);
    assert.equal(result.ok, true, `${skill}: an empty battlefield can still receive an active skill`);
    const event = activeEvent(result.events);
    assert.equal(event.floorId, 1, 'an old manual selection does not redirect an empty cast');
    assert.equal(event.affectedCount, 0);
    assert.equal(event.totalAmount, 0);
    assert.deepEqual(event.targets, []);
    assert.equal(result.events.filter((item) => item.type === 'heal' || item.type === 'hit').length, 0);
    const cooldowns = { ...state.activeSkills };
    const repeat = sim.useActiveSkill(skill);
    assert.equal(repeat.ok, false, `${skill}: an empty cast still uses its normal cooldown`);
    assert.deepEqual(repeat.events, []);
    assert.deepEqual(state.activeSkills, cooldowns, 'a rejected repeat cannot reset any cooldown');
  }
  assert.deepEqual(state.activeSkills, {
    battleCryCooldown: BALANCE.skillBattleCry.cooldown,
    lifeEchoCooldown: BALANCE.skillLifeEcho.cooldown,
    crystalRainCooldown: BALANCE.skillCrystalRain.cooldown,
    rapidAdvanceCooldown: 0,
    rapidAdvanceUntil: 0,
  });

  const fullHealth = setup();
  const ally = addUnit(fullHealth.sim, 'ally');
  const heal = fullHealth.sim.useActiveSkill('lifeEcho');
  assert.equal(heal.ok, true, 'healing can be cast even when all allies are healthy');
  assert.equal(ally.hp, ally.maxHp);
  assert.equal(activeEvent(heal.events).affectedCount, 0);
  assert.equal(fullHealth.state.activeSkills.lifeEchoCooldown, BALANCE.skillLifeEcho.cooldown);
}

function verifyInvalidUnitsIgnored() {
  const { sim } = setup();
  const deadAlly = addUnit(sim, 'ally', 1, 0);
  const deadEnemy = addUnit(sim, 'enemy', 1, 0);
  deadAlly.phase = deadEnemy.phase = 'dead';
  const zeroAlly = addUnit(sim, 'ally', 1, 0);
  addUnit(sim, 'ally', 999, 10);
  addUnit(sim, 'enemy', 999);
  addUnit(sim, 'enemy', 2, 0);
  sim.state.floors[9] = makeFloor(9, false);
  addUnit(sim, 'enemy', 9);
  assert.equal(sim.getActiveSkillTargetFloor(), 1, 'dead, zero-health and locked-floor units do not move the target');
  for (const skill of ['battleCry', 'lifeEcho', 'crystalRain'] as const) {
    const result = sim.useActiveSkill(skill);
    assert.equal(result.ok, true, `${skill}: invalid units do not prevent an empty cast`);
    assert.equal(activeEvent(result.events).affectedCount, 0);
  }
  assert.equal(zeroAlly.hp, 0, 'an empty heal cannot revive a zero-health unit');
  assert.equal(zeroAlly.atkBoostFactor, 0, 'zero-health units do not receive buffs');
}

function verifyAutomaticTarget() {
  const { sim, state } = setup();
  for (const floor of [3, 7, 9]) state.floors[floor] = makeFloor(floor, true, true);
  state.highestClearedFloor = 6;
  const lowerEnemy = addUnit(sim, 'enemy', 1);
  const lowerAlly = addUnit(sim, 'ally', 1);
  const middleEnemy = addUnit(sim, 'enemy', 3);
  const highestEnemy = addUnit(sim, 'enemy', 7);
  const highestAlly = addUnit(sim, 'ally', 7, 20);
  const deadAbove = addUnit(sim, 'enemy', 9, 0);
  deadAbove.phase = 'dead';
  state.selectedFloor = 1;
  assert.equal(sim.getActiveSkillTargetFloor(), 7, 'skills target actual progress instead of the saved selection or highest unlocked floor');
  state.units.reverse();
  sim.selectFloor(3);
  assert.equal(sim.getActiveSkillTargetFloor(), 7, 'unit iteration order and manually viewing a floor cannot change the target');
  const buff = sim.useActiveSkill('battleCry');
  assert.equal(buff.ok, true);
  assert.equal(activeEvent(buff.events).floorId, 7);
  assert.equal(highestAlly.atkBoostFactor, BALANCE.skillBattleCry.atkBoost);
  assert.equal(lowerAlly.atkBoostFactor, 0, 'lower-floor allies are not buffed');
  const heal = sim.useActiveSkill('lifeEcho');
  assert.equal(heal.ok, true);
  assert.equal(activeEvent(heal.events).floorId, 7);
  assert.equal(highestAlly.hp, 45);

  // 杀掉最高层的最后一怪后，空目标仍施放在推进前线，而不是跳回低层的怪。
  highestEnemy.hp = 0;
  highestEnemy.phase = 'dead';
  const rain = sim.useActiveSkill('crystalRain');
  assert.equal(rain.ok, true);
  assert.equal(activeEvent(rain.events).floorId, 7, 'an enemy dying cannot move the target backward');
  assert.equal(activeEvent(rain.events).affectedCount, 0);
  assert.equal(middleEnemy.hp, 100);
  assert.equal(lowerEnemy.hp, 100, 'a stale manual selection cannot receive the damage');
  middleEnemy.phase = lowerEnemy.phase = 'dead';
  state.units.length = 0;
  assert.equal(sim.getActiveSkillTargetFloor(), 7, 'progress remains the target when all units are absent');

  const advance = setup();
  addUnit(advance.sim, 'enemy', 3);
  addUnit(advance.sim, 'ally', 7);
  assert.equal(advance.sim.getActiveSkillTargetFloor(), 7, 'a living ally can establish a higher front without any enemy there');
  const lastEnemy = addUnit(advance.sim, 'enemy', 9, 20);
  advance.state.floors[9].challenge = 'active';
  assert.equal(advance.sim.getActiveSkillTargetFloor(), 9, 'a higher active enemy also raises the target');
  const killingRain = advance.sim.useActiveSkill('crystalRain');
  assert.equal(killingRain.ok, true);
  assert.equal(lastEnemy.phase, 'dead');
  assert.equal(advance.sim.getActiveSkillTargetFloor(), 9, 'the just-cleared wave stays targeted before normal death processing');
  advance.state.units = advance.state.units.filter((unit) => unit.floorId !== 9);
  assert.equal(advance.sim.getActiveSkillTargetFloor(), 9, 'a wave gap does not fall back to lower surviving units');

  const nextSegment = setup();
  nextSegment.state.highestClearedFloor = 10;
  nextSegment.state.maxFloorUnlocked = 20;
  for (let floor = 11; floor <= 20; floor++) nextSegment.state.floors[floor] = makeFloor(floor, true);
  assert.equal(nextSegment.sim.getActiveSkillTargetFloor(), 11, 'a new ten-floor segment starts at 11 instead of its pre-unlocked top 20');
  assert.equal(activeEvent(nextSegment.sim.useActiveSkill('crystalRain').events).floorId, 11);

  const completedClassic = setup();
  completedClassic.state.mode = 'classic';
  completedClassic.state.maxFloorUnlocked = completedClassic.state.highestClearedFloor = 300;
  assert.equal(completedClassic.sim.getActiveSkillTargetFloor(), 300, 'a completed classic game never targets floor 301');
}

function verifyBattleCry() {
  const { sim, state } = setup();
  const ally = addUnit(sim, 'ally', 2);
  const otherAlly = addUnit(sim, 'ally', 1);
  const enemy = addUnit(sim, 'enemy', 2);
  ally.attackCooldown = 0;
  const result = sim.useActiveSkill('battleCry');
  assert.equal(result.ok, true);
  const event = activeEvent(result.events);
  assert.equal(event.affectedCount, 1);
  assert.equal(event.duration, 8);
  assert.deepEqual(event.targets, [{ unitId: ally.id, x: ally.x / BALANCE.floorLogicalWidth, amount: 0 }]);
  assert.equal(ally.atkBoostUntil, state.time + 8);
  assert.equal(ally.atkBoostFactor, 0.3);
  assert.equal(otherAlly.atkBoostFactor, 0, 'the automatic target floor limits the buff');
  assert.equal(state.activeSkills.battleCryCooldown, 30);
  sim.step(BALANCE.tick);
  assert.equal(enemy.hp, 74, 'the buff increases a real 20-damage attack to 26 damage');
  assert.equal(sim.useActiveSkill('battleCry').ok, false, 'cooldown prevents recasting');
  for (let tick = 0; tick < 8.1 / BALANCE.tick; tick++) sim.step(BALANCE.tick);
  assert.equal(ally.atkBoostFactor, 0, 'the attack bonus expires after its own duration');
  assert.ok(state.activeSkills.battleCryCooldown > 20, 'effect duration and cooldown are separate timers');
}

function verifyLifeEcho() {
  const { sim, state } = setup();
  const injured = addUnit(sim, 'ally', 2, 20);
  const almostFull = addUnit(sim, 'ally', 2, 95, 400);
  const full = addUnit(sim, 'ally', 2, 100, 300);
  const other = addUnit(sim, 'ally', 1, 10);
  addUnit(sim, 'enemy', 2);
  // Command results must only contain this cast, even if a previous frame has queued events.
  sim.events.push({ type: 'active_skill', at: 0, skill: 'battleCry', floorId: 2 });
  const result = sim.useActiveSkill('lifeEcho');
  assert.equal(result.ok, true);
  assert.equal(injured.hp, 45);
  assert.equal(almostFull.hp, 100);
  assert.equal(full.hp, 100);
  assert.equal(other.hp, 10, 'healing never spills into another floor');
  const event = activeEvent(result.events);
  assert.equal(event.skill, 'lifeEcho');
  assert.equal(event.affectedCount, 2, 'only allies whose health changed count toward the result');
  assert.equal(event.totalAmount, 30, 'the result reports effective healing rather than overhealing');
  assert.equal(event.duration, 0);
  assert.deepEqual(result.events.filter((event) => event.type === 'heal').map((event) => event.amount), [25, 5]);
  assert.deepEqual(event.targets, [
    { unitId: injured.id, x: injured.x / BALANCE.floorLogicalWidth, amount: 25 },
    { unitId: almostFull.id, x: almostFull.x / BALANCE.floorLogicalWidth, amount: 5 },
  ]);
  assert.equal(state.activeSkills.lifeEchoCooldown, 35);
  assert.equal(sim.useActiveSkill('lifeEcho').ok, false);
  assert.equal(injured.hp, 45, 'a rejected recast cannot heal again');
}

function verifyCrystalRain() {
  const { sim, state } = setup();
  state.highestClearedFloor = 10;
  state.floors[10] = makeFloor(10, true, true);
  const doomed = addUnit(sim, 'enemy', 10, 20);
  const survivor = addUnit(sim, 'enemy', 10, 100, 700);
  const other = addUnit(sim, 'enemy', 1);
  const goldBefore = state.resources.gold;
  const result = sim.useActiveSkill('crystalRain');
  assert.equal(result.ok, true);
  assert.equal(doomed.hp, 0);
  assert.equal(doomed.phase, 'dead');
  assert.equal(survivor.hp, 25, 'rain scales with highest cleared floor: 50 + 10 * 2.5');
  assert.equal(other.hp, 100, 'damage never spills into another floor');
  const event = activeEvent(result.events);
  assert.equal(event.affectedCount, 2);
  assert.equal(event.totalAmount, 95, 'damage feedback excludes overkill');
  assert.equal(event.duration, 0);
  assert.deepEqual(result.events.filter((event) => event.type === 'hit').map((event) => event.dmg), [20, 75]);
  assert.deepEqual(event.targets, [
    { unitId: doomed.id, x: doomed.x / BALANCE.floorLogicalWidth, amount: 20 },
    { unitId: survivor.id, x: survivor.x / BALANCE.floorLogicalWidth, amount: 75 },
  ]);
  assert.equal(state.activeSkills.crystalRainCooldown, 45);
  assert.equal(sim.useActiveSkill('crystalRain').ok, false);
  assert.equal(survivor.hp, 25);
  sim.step(BALANCE.tick);
  assert.equal(state.resources.gold, goldBefore + monsterGoldAt(10), 'a skill kill receives normal loot');
  assert.equal(state.units.includes(doomed), false, 'skill kills use the normal death cleanup');
  sim.step(BALANCE.tick);
  assert.equal(state.resources.gold, goldBefore + monsterGoldAt(10), 'loot is not awarded twice');
  assert.equal(sim.events.filter((event) => event.type === 'enemy_killed').length, 1);
}

function verifyBannerPreservesBattleCry() {
  const { sim, state } = setup();
  const ally = addUnit(sim, 'ally');
  const banner: UnitState = makeUnit(state, 'hero', 'hero_banner', 1, 'ally', 300, {
    hp: 100, atk: 20, def: 0, attackInterval: 100, range: 60, moveSpeed: 0, critChance: 0, critMult: 1.5,
  });
  banner.skillCooldown = 0;
  state.units.push(banner);
  addUnit(sim, 'enemy');
  assert.equal(sim.useActiveSkill('battleCry').ok, true);
  const until = ally.atkBoostUntil;
  sim.step(BALANCE.tick);
  assert.ok(sim.events.some((event) => event.type === 'hero_skill' && event.skill === 'banner'), 'the weaker banner actually fires during the active buff');
  for (const unit of [ally, banner]) {
    assert.equal(unit.atkBoostFactor, 0.3, 'the automatic banner cannot weaken battle cry');
    assert.equal(unit.atkBoostUntil, until, 'the automatic banner cannot shorten battle cry');
  }
  for (let tick = 0; tick < 8.1 / BALANCE.tick; tick++) sim.step(BALANCE.tick);
  banner.skillCooldown = 0;
  sim.step(BALANCE.tick);
  assert.equal(ally.atkBoostFactor, 0.15, 'the normal banner still works after battle cry expires');
}

verifyEmptyCasts();
verifyInvalidUnitsIgnored();
verifyAutomaticTarget();
verifyBattleCry();
verifyLifeEcho();
verifyCrystalRain();
verifyBannerPreservesBattleCry();
console.log('Active skill targets, real effects, cooldowns, feedback, kill rewards and banner compatibility passed.');
