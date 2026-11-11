// 经济与成长配置 —— 本版自定的初始数值，可实测调整。
// 所有数值与概率从配置读取，禁止散落在渲染代码中。

export const BALANCE = {
  // 战斗步长（秒）
  tick: 1 / 20,

  // 楼层
  floorsTotal: 300,
  floorsPerGate: 10,
  floorsVisibleHint: 5,
  floorLogicalWidth: 1000, // 逻辑横坐标宽度

  // 普通怪物成长（楼层 f）
  monsterHpBase: 40,
  monsterHpGrowth: 1.022,
  monsterAtkBase: 4,
  monsterAtkGrowth: 1.018,
  monsterDefPer12Floors: 1, // floor((f-1)/12) * 职业系数
  monsterGoldBase: 3,
  monsterGoldGrowth: 1.02,
  monsterGoldMin: 1,

  // Boss
  bossHpMult: 8,
  bossAtkMult: 1.8,
  bossGoldMult: 20,
  bossHundredFloorMult: 1.5, // 整百层章节系数

  // 英雄成长
  heroAtkGrowthPerLevel: 1.035,
  heroHpGrowthPerLevel: 1.03,
  heroDefGrowthPerLevel: 1.02,
  heroStarAtkBonus: 0.15,
  heroStarHpBonus: 0.2,
  heroMaxLevel: 200,
  heroMaxStar: 5,
  heroUpgradeCostBase: 25,
  heroUpgradeCostGrowth: 1.055,

  // 伤害公式
  dmgArmorSoftCap: 0.2, // max(0.20, 100/(100+def))
  dmgArmorK: 100,
  critMultDefault: 1.5,
  critChanceCap: 0.75,
  atkSpeedMultCap: 2.5,

  // 普通召唤勇者
  squireBaseHp: 70,
  squireBaseAtk: 8,
  squireBaseDef: 0,
  squireAttackInterval: 1.0,
  squireMeleeRange: 60,
  squireMoveSpeed: 48,
  squireInventoryMax: 8,
  squireRegenPerSec: 1,
  squireAliveMax: 12,
  squireSpawnInterval: 0.18,
  squireUpgradeCostBase: 10,
  squireUpgradeCostGrowth: 1.15,
  squireExponentialLevels: 200,

  // 英雄
  heroRespawnDelay: 8,
  heroRespawnFloor: 1,
  crossClearedFloorMinTime: 0.15,

  // 波次
  wavesPerFloor: 3,
  enemiesPerWave: 3,
  gateWaveGuards: 4, // 关口护卫数 + 1 Boss
  waveSpawnInterval: 0.8, // 波次内刷新间隔
  waveGap: 1.5, // 波次间等待

  // 掉落
  gemDropChance: 0.02,

  // 招募
  recruitTicketGoldPrice: 500,
  recruitTicketGrowth: 1.5, // 后续购买递增
  duplicateSoulShards: 20,
  starCosts: [0, 20, 40, 80, 160] as const, // 2..5 星（index=star）

  // 宝石
  gemBoardSlots: 8,
  gemBoardInitialSlots: 4,
  gemBoardUnlockFloors: [20, 50, 100, 200] as const,
  gemMaxLevel: 5,
  gemFuseCostBase: 50,
  gemFuseCostGrowth: 3, // 50 * 3^(level-1)
  gemPercentGrowth: 1.7, // 攻击/生命/防御
  gemMinorGrowth: 1.5, // 急速/暴击/金币

  // 主动技能
  skillBattleCry: { name: '战意鼓舞', atkBoost: 0.3, duration: 8, cooldown: 30 },
  skillLifeEcho: { name: '生命回响', hpRatio: 0.25, cooldown: 35 },
  skillCrystalRain: { name: '晶雨打击', dmg: 50, cooldown: 45, dmgScaling: 2.5 }, // dmg 为基础值，随最高首通层成长

  // 离线收益
  offlineMaxHours: 8,
  offlineRateFactor: 0.8,
  offlineEvalSeconds: 120,

  // 据点（100 层解锁）
  strongholdUnlockFloor: 100,
  arenaUnlockFloor: 300,
  strongholdCapHours: 8,

  // 竞技场
  arenaDuration: 60,
  arenaMaxUnitsPerSide: 12,

  // 自动保存
  autoSaveSecDefault: 8,

  // 数值上限（资源安全整数，超出截断）
  goldCap: Number.MAX_SAFE_INTEGER,
} as const;

// 成长公式助手
// 在原有等级和楼层范围保留指数曲线，之后按最后一段的斜率线性延伸。
export function growthFactor(rate: number, steps: number, exponentialSteps: number): number {
  const exponential = Math.min(Math.max(0, steps), exponentialSteps);
  const extra = Math.max(0, steps - exponentialSteps);
  return Math.pow(rate, exponential) * (1 + (rate - 1) * extra);
}

export function monsterHpAt(floorId: number, factor: number): number {
  return Math.round(BALANCE.monsterHpBase * growthFactor(BALANCE.monsterHpGrowth, floorId - 1, BALANCE.floorsTotal - 1) * factor);
}

export function monsterAtkAt(floorId: number, factor: number): number {
  return Math.round(BALANCE.monsterAtkBase * growthFactor(BALANCE.monsterAtkGrowth, floorId - 1, BALANCE.floorsTotal - 1) * factor);
}

export function monsterDefAt(floorId: number, factor: number): number {
  return Math.floor(Math.max(0, floorId - 1) / 12) * BALANCE.monsterDefPer12Floors * factor;
}

export function monsterGoldAt(floorId: number): number {
  const gold = BALANCE.monsterGoldBase * growthFactor(BALANCE.monsterGoldGrowth, floorId - 1, BALANCE.floorsTotal - 1);
  return Math.min(BALANCE.goldCap, Math.max(BALANCE.monsterGoldMin, Math.round(gold)));
}

export function heroAtk(base: number, level: number, star: number): number {
  return base * growthFactor(BALANCE.heroAtkGrowthPerLevel, level - 1, BALANCE.heroMaxLevel - 1) * (1 + BALANCE.heroStarAtkBonus * (star - 1));
}

export function heroHp(base: number, level: number, star: number): number {
  return base * growthFactor(BALANCE.heroHpGrowthPerLevel, level - 1, BALANCE.heroMaxLevel - 1) * (1 + BALANCE.heroStarHpBonus * (star - 1));
}

export function heroDef(base: number, level: number): number {
  return base * growthFactor(BALANCE.heroDefGrowthPerLevel, level - 1, BALANCE.heroMaxLevel - 1);
}

export function heroUpgradeCost(level: number, base: number): number {
  const price = base * growthFactor(BALANCE.heroUpgradeCostGrowth, level - 1, BALANCE.heroMaxLevel - 1);
  return Math.min(BALANCE.goldCap, Math.ceil(price));
}

export function squireUpgradeCost(level: number): number {
  const price = BALANCE.squireUpgradeCostBase * growthFactor(BALANCE.squireUpgradeCostGrowth, level, BALANCE.squireExponentialLevels);
  return Math.min(BALANCE.goldCap, Math.ceil(price));
}

export function damageFormula(atk: number, def: number, mult = 1, critMult = 1): number {
  const armorFactor = Math.max(BALANCE.dmgArmorSoftCap, BALANCE.dmgArmorK / (BALANCE.dmgArmorK + def));
  return Math.max(1, Math.floor(atk * mult * critMult * armorFactor));
}

export function isGateFloor(floorId: number): boolean {
  return floorId % BALANCE.floorsPerGate === 0;
}
