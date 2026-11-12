// 初始状态创建与属性派生。
import type { FloorState, GameState, HeroState, UnitState } from './types';
import { Random } from './rng';
import { HEROES, HERO_ORDER, MELEE_RANGE } from '../data/heroes';
import { MONSTERS, BOSS_VARIANTS_BY_REGION, regionOfFloor, MONSTERS_BY_REGION } from '../data/monsters';
import {
  BALANCE, growthFactor, heroAtk, heroHp, heroDef, isGateFloor,
  monsterAtkAt, monsterDefAt, monsterHpAt,
} from '../data/economy';
import { sumBoardGems } from '../data/gems';
import { QUESTS, ACHIEVEMENTS } from '../data/quests';

export const SCHEMA_VERSION = 1;
export const CONTENT_VERSION = 3;

const DEFAULT_HERO_ORDER = [...HERO_ORDER].sort((a, b) => Number(HEROES[b].melee) - Number(HEROES[a].melee));

export function normalizeHeroOrder(order: unknown): string[] {
  const ids = new Set<string>(DEFAULT_HERO_ORDER);
  const known = Array.isArray(order)
    ? order.filter((id): id is string => typeof id === 'string' && ids.has(id))
    : [];
  return [...new Set([...known, ...DEFAULT_HERO_ORDER])];
}

function makeHeroState(id: string): HeroState {
  const starter = id === 'hero_guard';
  return { owned: starter, enabled: starter, level: 1, star: 1, weapon: null, armor: null, trinket: null };
}

export function createNewGame(seed?: number): GameState {
  const s = seed ?? (Math.floor(Math.random() * 0x7fffffff) + 1);
  const heroes: Record<string, HeroState> = {};
  for (const id of HERO_ORDER) heroes[id] = makeHeroState(id);

  const quests: GameState['quests'] = {};
  for (const q of QUESTS) quests[q.id] = { id: q.id, progress: 0, claimed: false };
  const achievements: GameState['achievements'] = {};
  for (const a of ACHIEVEMENTS) achievements[a.id] = { id: a.id, progress: 0, claimed: false, unlockedAt: 0 };

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    revision: 0,
    seed: s,
    rng: new Random(s).getState(),
    time: 0,
    accountedThrough: Math.floor(Date.now() / 1000),
    nextUnitId: 1,
    mode: 'endless',
    resources: {
      gold: 0,
      crystal: 0,
      recruitTickets: 0,
      soulShards: {},
      upgradeDust: 0,
    },
    heroes,
    heroOrder: normalizeHeroOrder(undefined),
    heroDeployAt: 0,
    lastHeroDeployed: null,
    summon: {
      inventory: BALANCE.squireInventoryMax,
      inventoryMax: BALANCE.squireInventoryMax,
      regenPerSec: BALANCE.squireRegenPerSec,
      aliveMax: BALANCE.squireAliveMax,
      attackLevel: 0,
      hpLevel: 0,
      stockLevel: 0,
      regenLevel: 0,
      aliveLevel: 0,
      autoEnabled: false,
      autoTargetFloor: null,
      spawnCooldown: 0,
    },
    gems: [],
    gemBoard: new Array(BALANCE.gemBoardSlots).fill(null),
    equipment: [],
    activeSkills: {
      battleCryCooldown: 0, lifeEchoCooldown: 0, crystalRainCooldown: 0,
      rapidAdvanceCooldown: 0, rapidAdvanceUntil: 0,
    },
    floors: {},
    units: [],
    maxFloorUnlocked: BALANCE.floorsPerGate,
    highestClearedFloor: 0,
    recruitCount: 1, // 免费新手招募岩盾，计入首次
    goldFloor: null,
    selectedFloor: 1,
    quests,
    achievements,
    stronghold: { sites: {} },
    arena: { wins: 0, dailyWins: 0, lastDailyReset: 0, bestTime: 0 },
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.6,
      sfxVolume: 0.8,
      mute: false,
      reduceFx: false,
      reduceShake: false,
      reduceNumbers: false,
      autoSaveSec: BALANCE.autoSaveSecDefault,
    },
    offlineRateCache: null,
  };

  // 解锁前 10 层
  for (let f = 1; f <= BALANCE.floorsPerGate; f++) {
    state.floors[f] = makeFloor(f, true);
  }
  return state;
}

export function makeFloor(floorId: number, unlocked = false, cleared = false): FloorState {
  return {
    floorId,
    unlocked,
    cleared,
    firstClearRewarded: cleared,
    challenge: cleared ? 'cleared' : 'inactive',
    waves: [],
    currentWave: -1,
    nextWaveAt: 0,
    isGoldFloor: false,
  };
}

export function isFloorUnlocked(state: GameState, floorId: number): boolean {
  return Number.isSafeInteger(floorId) && floorId >= 1 && floorId <= state.maxFloorUnlocked
    && state.floors[floorId]?.unlocked !== false;
}

export function isFloorCleared(state: GameState, floorId: number): boolean {
  return isFloorUnlocked(state, floorId)
    && (state.floors[floorId]?.cleared ?? floorId <= state.maxFloorUnlocked - BALANCE.floorsPerGate);
}

// 解锁新段前必须通关整段。旧段的已通关记录可由最高解锁层恢复。
export function compactClearedFloors(state: GameState): void {
  if (state.mode !== 'endless') return;
  const previousSegmentEnd = state.maxFloorUnlocked - BALANCE.floorsPerGate;
  for (const floor of Object.values(state.floors)) {
    if (floor.floorId <= previousSegmentEnd && floor.cleared && floor.challenge !== 'active'
      && floor.floorId !== state.goldFloor) {
      delete state.floors[floor.floorId];
    }
  }
}

export function normalizeGameState(state: GameState): GameState {
  if (state.mode !== 'classic' || state.maxFloorUnlocked > BALANCE.floorsTotal
    || state.highestClearedFloor > BALANCE.floorsTotal) state.mode = 'endless';
  state.contentVersion = Math.max(state.contentVersion ?? 1, CONTENT_VERSION);
  for (const id of HERO_ORDER) state.heroes[id] ??= makeHeroState(id);
  normalizeEquipmentOwnership(state);
  state.heroOrder = normalizeHeroOrder(state.heroOrder);
  if (!Number.isFinite(state.heroDeployAt) || state.heroDeployAt < 0) state.heroDeployAt = 0;
  const active = state.activeSkills;
  active.rapidAdvanceCooldown = Number.isFinite(active.rapidAdvanceCooldown) && active.rapidAdvanceCooldown >= 0
    ? Math.min(active.rapidAdvanceCooldown, BALANCE.skillRapidAdvance.cooldown) : 0;
  active.rapidAdvanceUntil = Number.isFinite(active.rapidAdvanceUntil) && active.rapidAdvanceUntil > state.time
    ? Math.min(active.rapidAdvanceUntil, state.time + BALANCE.skillRapidAdvance.duration) : 0;
  if (state.lastHeroDeployed == null || !state.heroOrder.includes(state.lastHeroDeployed)) {
    state.lastHeroDeployed = null;
  }

  const start = Math.max(1, state.maxFloorUnlocked - BALANCE.floorsPerGate + 1);
  for (let f = state.mode === 'classic' ? 1 : start; f <= state.maxFloorUnlocked; f++) {
    state.floors[f] ??= makeFloor(f, true, f < start);
  }
  compactClearedFloors(state);
  return state;
}

function normalizeEquipmentOwnership(state: GameState): void {
  const equipmentById = new Map(state.equipment.map((equipment) => [equipment.id, equipment]));
  const holders = new Map<string, string[]>();
  const changedHeroes = new Set<string>();
  for (const heroId of HERO_ORDER) {
    const hero = state.heroes[heroId];
    for (const slot of ['weapon', 'armor', 'trinket'] as const) {
      const id = hero[slot];
      if (!id) continue;
      const equipment = equipmentById.get(id);
      if (!hero.owned || !equipment || equipment.slot !== slot) {
        hero[slot] = null;
        changedHeroes.add(heroId);
      } else {
        const owners = holders.get(id) ?? [];
        owners.push(heroId);
        holders.set(id, owners);
      }
    }
  }
  for (const equipment of state.equipment) {
    const owners = holders.get(equipment.id) ?? [];
    // 旧存档可能同时保留多名英雄的槽位；优先保留最后记录且实际穿戴的英雄。
    const owner = owners.find((id) => id === equipment.equippedBy) ?? owners[0] ?? null;
    equipment.equippedBy = owner;
    for (const heroId of owners) {
      if (heroId === owner) continue;
      state.heroes[heroId][equipment.slot] = null;
      changedHeroes.add(heroId);
    }
  }
  for (const unit of state.units) {
    if (unit.kind !== 'hero' || unit.phase === 'dead' || !changedHeroes.has(unit.templateId)) continue;
    const ratio = unit.hp / unit.maxHp;
    const stats = heroStatsOf(state, unit.templateId);
    unit.maxHp = stats.hp;
    unit.hp = Math.max(1, Math.round(stats.hp * ratio));
    unit.attack = stats.atk;
    unit.defense = stats.def;
  }
}

// —— 属性派生 ——

export interface DerivedStats {
  hp: number;
  atk: number;
  def: number;
  attackInterval: number;
  range: number;
  moveSpeed: number;
  critChance: number;
  critMult: number;
}

export function gemTotalsOf(state: GameState) {
  return sumBoardGems(state.gemBoard);
}

function equipBonusesOf(state: GameState, hero: HeroState) {
  let atk = 0, hp = 0, def = 0;
  for (const id of [hero.weapon, hero.armor, hero.trinket]) {
    if (!id) continue;
    const eq = state.equipment.find((e) => e.id === id);
    if (!eq) continue;
    atk += eq.atkBonus;
    hp += eq.hpBonus;
    def += eq.defBonus;
  }
  return { atk, hp, def };
}

export function canAscendHero(state: GameState, heroId: string): boolean {
  const hero = state.heroes[heroId];
  if (!hero?.owned || hero.star >= BALANCE.heroMaxStar) return false;
  const cost = BALANCE.starCosts[hero.star];
  return cost !== undefined && (state.resources.soulShards[heroId] ?? 0) >= cost;
}

export function heroStatsOf(state: GameState, heroId: string): DerivedStats {
  const cfg = HEROES[heroId];
  const hero = state.heroes[heroId];
  const g = gemTotalsOf(state);
  const eq = equipBonusesOf(state, hero);

  const baseAtk = heroAtk(cfg.baseAtk, hero.level, hero.star) + eq.atk;
  const baseHp = heroHp(cfg.baseHp, hero.level, hero.star) + eq.hp;
  const baseDef = heroDef(cfg.baseDef, hero.level) + eq.def + g.defFlat;

  const atk = Math.round(baseAtk * (1 + g.atkPct));
  const hp = Math.round(baseHp * (1 + g.hpPct));
  const def = Math.round(baseDef);

  const atkSpeedMult = Math.min(BALANCE.atkSpeedMultCap, 1 + g.hastePct);
  const interval = cfg.attackInterval / atkSpeedMult;
  const critChance = Math.min(BALANCE.critChanceCap, cfg.critChance + g.critPoints);

  return {
    hp,
    atk,
    def,
    attackInterval: interval,
    range: cfg.range > 0 ? cfg.range : MELEE_RANGE,
    moveSpeed: cfg.moveSpeed,
    critChance,
    critMult: cfg.critMult,
  };
}

export function squireStatsOf(state: GameState): DerivedStats {
  const g = gemTotalsOf(state);
  const s = state.summon;
  const atk = Math.round(BALANCE.squireBaseAtk * growthFactor(1.1, s.attackLevel, BALANCE.squireExponentialLevels) * (1 + g.atkPct));
  const hp = Math.round(BALANCE.squireBaseHp * growthFactor(1.1, s.hpLevel, BALANCE.squireExponentialLevels) * (1 + g.hpPct));
  const def = Math.round(g.defFlat);
  const atkSpeedMult = Math.min(BALANCE.atkSpeedMultCap, 1 + g.hastePct);
  return {
    hp,
    atk,
    def,
    attackInterval: BALANCE.squireAttackInterval / atkSpeedMult,
    range: MELEE_RANGE,
    moveSpeed: BALANCE.squireMoveSpeed,
    critChance: g.critPoints,
    critMult: BALANCE.critMultDefault,
  };
}

// 怪物最终属性（给定楼层与职业系数）
export function monsterStatsOf(monsterId: string, floorId: number): DerivedStats {
  const cfg = MONSTERS[monsterId];
  const isBoss = cfg.kind === 'boss';
  let hp = monsterHpAt(floorId, cfg.hpFactor);
  let atk = monsterAtkAt(floorId, cfg.atkFactor);
  const def = monsterDefAt(floorId, cfg.defFactor);
  if (isBoss && cfg.boss) {
    hp = Math.round(hp * cfg.boss.hpMult);
    atk = Math.round(atk * cfg.boss.atkMult);
    // 整百层章节系数
    if (floorId % 100 === 0) hp = Math.round(hp * BALANCE.bossHundredFloorMult);
  }
  const atkSpeedMult = 1;
  return {
    hp,
    atk,
    def,
    attackInterval: cfg.attackInterval / atkSpeedMult,
    range: cfg.melee ? MELEE_RANGE : cfg.range,
    moveSpeed: cfg.moveSpeed,
    critChance: cfg.critChance,
    critMult: cfg.critMult,
  };
}

// 从配置生成战斗单位
export function makeUnit(
  state: GameState,
  kind: UnitState['kind'],
  templateId: string,
  floorId: number,
  team: UnitState['team'],
  x: number,
  stats: DerivedStats,
): UnitState {
  const cfg = HEROES[templateId] ?? MONSTERS[templateId];
  return {
    id: state.nextUnitId++,
    kind,
    templateId,
    floorId,
    team,
    x,
    maxHp: stats.hp,
    hp: stats.hp,
    shield: 0,
    attack: stats.atk,
    defense: stats.def,
    attackInterval: stats.attackInterval,
    range: stats.range,
    moveSpeed: stats.moveSpeed,
    attackCooldown: 0,
    skillCooldown: cfg && 'skillCooldown' in cfg ? cfg.skillCooldown : 0,
    phase: 'idle',
    targetId: null,
    slowUntil: 0,
    slowFactor: 0,
    atkBoostUntil: 0,
    atkBoostFactor: 0,
    burnUntil: 0,
    burnDps: 0,
    critChance: stats.critChance,
    critMult: stats.critMult,
    heroLevel: 'heroLevel' in stats ? 0 : 0,
    heroStar: 1,
    respawnAt: -1,
    expireAt: -1,
    facing: team === 'ally' ? 1 : -1,
    vx: 0,
  };
}

// 选择某楼层的普通怪物类型（确定性：由种子 + 楼层 + 波次决定）
export function pickMonsterForFloor(rng: Random, floorId: number): string {
  const region = regionOfFloor(floorId);
  const pool = MONSTERS_BY_REGION[region];
  return pool[rng.int(0, pool.length - 1)];
}

export function bossForFloor(floorId: number): string {
  const gateInRegion = Math.ceil(((floorId - 1) % 100 + 1) / BALANCE.floorsPerGate);
  const variant = gateInRegion % 2 === 0 && floorId % 100 !== 0 ? 1 : 0;
  return BOSS_VARIANTS_BY_REGION[regionOfFloor(floorId)][variant];
}

export function isGateFloorHelper(floorId: number): boolean {
  return isGateFloor(floorId);
}

// 数值安全辅助
export function safeAdd(n: number, d: number): number {
  if (!Number.isFinite(d)) return n;
  const r = n + d;
  if (r < 0) return 0;
  return Math.min(BALANCE.goldCap, Math.floor(r));
}
