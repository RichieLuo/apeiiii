import assert from 'node:assert/strict';
import { Simulation } from '../src/game/core/simulation';
import { createNewGame, heroStatsOf, makeUnit, normalizeGameState } from '../src/game/core/state';
import type { EquipmentInstance, GameState, UnitState } from '../src/game/core/types';

function equipment(id: string, hp: number): EquipmentInstance {
  return {
    id, templateId: 'generated_armor', slot: 'armor', rarity: 'rare', level: 1,
    locked: false, equippedBy: null, atkBonus: 0, hpBonus: hp, defBonus: 5,
  };
}

function heroUnit(state: GameState, id: string) {
  state.heroes[id].owned = true;
  const unit = makeUnit(state, 'hero', id, 1, 'ally', 300, heroStatsOf(state, id));
  unit.hp = Math.round(unit.maxHp * 0.4);
  unit.phase = 'attacking';
  unit.attackCooldown = 0.73;
  unit.skillCooldown = 4.2;
  unit.atkBoostFactor = 0.3;
  unit.atkBoostUntil = 16;
  unit.slowFactor = 0.25;
  unit.slowUntil = 12;
  state.units.push(unit);
  return unit;
}

function combatState(unit: UnitState) {
  return {
    phase: unit.phase, attackCooldown: unit.attackCooldown, skillCooldown: unit.skillCooldown,
    atkBoostFactor: unit.atkBoostFactor, atkBoostUntil: unit.atkBoostUntil,
    slowFactor: unit.slowFactor, slowUntil: unit.slowUntil,
  };
}

{
  const state = createNewGame(307);
  const oldArmor = equipment('old_armor', 40);
  const newArmor = equipment('new_armor', 100);
  state.equipment.push(oldArmor, newArmor);
  state.heroes.hero_guard.armor = oldArmor.id;
  oldArmor.equippedBy = 'hero_guard';
  const guard = heroUnit(state, 'hero_guard');
  const archer = heroUnit(state, 'hero_archer');
  const sim = new Simulation(state);
  const initialGuardRatio = guard.hp / guard.maxHp;
  const initialGuardCombat = combatState(guard);
  assert.equal(sim.equipToHero('hero_guard', newArmor.id).ok, true);
  assert.equal(oldArmor.equippedBy, null, 'replacing equipment releases the previous item');
  assert.equal(newArmor.equippedBy, 'hero_guard');
  assert.equal(state.heroes.hero_guard.armor, newArmor.id);
  assert.equal(guard.maxHp, heroStatsOf(state, 'hero_guard').hp);
  assert.equal(guard.hp, Math.round(guard.maxHp * initialGuardRatio));
  assert.deepEqual(combatState(guard), initialGuardCombat);

  const ratios = [guard.hp / guard.maxHp, archer.hp / archer.maxHp];
  const combat = [combatState(guard), combatState(archer)];
  assert.equal(sim.equipToHero('hero_archer', newArmor.id).ok, true);
  assert.equal(state.heroes.hero_guard.armor, null, 'transfer clears the original hero slot');
  assert.equal(state.heroes.hero_archer.armor, newArmor.id);
  assert.equal(newArmor.equippedBy, 'hero_archer');
  for (const [index, unit] of [guard, archer].entries()) {
    const stats = heroStatsOf(state, unit.templateId);
    assert.equal(unit.maxHp, stats.hp, 'both heroes immediately receive their new stats');
    assert.equal(unit.defense, stats.def);
    assert.equal(unit.hp, Math.round(unit.maxHp * ratios[index]), 'transfer preserves health percentage');
    assert.deepEqual(combatState(unit), combat[index]);
  }
  const unchanged = structuredClone(state);
  assert.equal(sim.equipToHero('hero_archer', newArmor.id).ok, false);
  assert.deepEqual(state, unchanged, 'equipping an already worn item does not mutate the save');
}

{
  const state = createNewGame(311);
  const shared = equipment('shared_armor', 100);
  const stale = equipment('unused_armor', 40);
  state.equipment.push(shared, stale);
  for (const id of ['hero_guard', 'hero_archer', 'hero_healer']) {
    state.heroes[id].owned = true;
    state.heroes[id].armor = shared.id;
  }
  shared.equippedBy = 'hero_archer';
  stale.equippedBy = 'hero_guard';
  const guard = heroUnit(state, 'hero_guard');
  const archer = heroUnit(state, 'hero_archer');
  const dead = heroUnit(state, 'hero_healer');
  dead.phase = 'dead';
  dead.hp = 0;
  dead.respawnAt = 20;
  const deadBefore = structuredClone(dead);
  const archerBefore = structuredClone(archer);
  const ratio = guard.hp / guard.maxHp;
  const combat = combatState(guard);
  normalizeGameState(state);
  assert.equal(state.heroes.hero_archer.armor, shared.id, 'the matching declared owner wins duplicate legacy references');
  assert.equal(state.heroes.hero_guard.armor, null);
  assert.equal(state.heroes.hero_healer.armor, null);
  assert.equal(shared.equippedBy, 'hero_archer');
  assert.equal(stale.equippedBy, null, 'unreferenced stale ownership is cleared');
  assert.equal(guard.maxHp, heroStatsOf(state, 'hero_guard').hp);
  assert.equal(guard.defense, heroStatsOf(state, 'hero_guard').def);
  assert.equal(guard.hp, Math.round(guard.maxHp * ratio));
  assert.deepEqual(combatState(guard), combat, 'repair does not reset combat state');
  assert.deepEqual(dead, deadBefore, 'repair never revives or changes a dead unit');
  assert.deepEqual(archer, archerBefore, 'the unchanged owner is not refreshed');
  const normalized = structuredClone(state);
  normalizeGameState(state);
  assert.deepEqual(state, normalized, 'normalization is idempotent for a valid save');
}

{
  const state = createNewGame(313);
  const armor = equipment('actual_owner', 100);
  state.equipment.push(armor);
  state.heroes.hero_guard.armor = armor.id;
  armor.equippedBy = 'hero_archer';
  const guard = heroUnit(state, 'hero_guard');
  const before = structuredClone(guard);
  normalizeGameState(state);
  assert.equal(armor.equippedBy, 'hero_guard', 'a real slot reference overrides stale ownership metadata');
  assert.equal(state.heroes.hero_guard.armor, armor.id);
  assert.deepEqual(guard, before, 'metadata-only corrections leave live unit state untouched');
}

console.log('equipment ownership: replacement, transfer, HP ratios, legacy repair, combat preservation and idempotence passed');
