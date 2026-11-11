// 游戏状态类型定义 —— 单一权威状态，全部从配置读取。
// 战斗单位与英雄持久数据分离：英雄为养成数据，单位为战场瞬时实体。

import type { RngState } from './rng';

export type Team = 'ally' | 'enemy';

export type UnitKind = 'hero' | 'squire' | 'turret' | 'enemy' | 'boss';

export type UnitStatePhase = 'idle' | 'moving' | 'attacking' | 'dead' | 'respawning';

export interface UnitState {
  id: number;
  kind: UnitKind;
  templateId: string; // 配置 id：hero_guard / unit_summon_squire / enemy_moss_blob / boss_...
  floorId: number;
  team: Team;
  x: number; // 逻辑横坐标（世界坐标，窗口尺寸不影响结果）
  maxHp: number;
  hp: number;
  shield: number; // 当前护盾量
  attack: number;
  defense: number;
  attackInterval: number; // 秒
  range: number; // 逻辑单位
  moveSpeed: number; // 逻辑单位/秒
  attackCooldown: number;
  skillCooldown: number;
  phase: UnitStatePhase;
  targetId: number | null;
  // 增益/状态
  slowUntil: number;
  slowFactor: number; // 0.25 => 减速 25%
  atkBoostUntil: number;
  atkBoostFactor: number; // 0.15 => +15%
  burnUntil: number;
  burnDps: number;
  critChance: number;
  critMult: number;
  // 英雄专属
  heroLevel: number;
  heroStar: number;
  // 复活（英雄）
  respawnAt: number; // 模拟时间点，-1 表示不在等待复活
  // 限时实体（炮台等）
  expireAt: number; // -1 表示无过期
  // 视觉/程序动画（渲染侧使用，不参与确定性结算）
  facing: number; // 1 右，-1 左
  vx: number; // 视觉插值用（可选）
}

// 波次与楼层
export interface WaveState {
  index: number; // 0 起
  monsterId: string;
  total: number;
  remainingSpawns: number;
  nextSpawnAt: number;
  alive: number;
  done: boolean;
}

export type FloorChallengeState = 'inactive' | 'active' | 'cleared';

export interface FloorState {
  floorId: number;
  unlocked: boolean;
  cleared: boolean; // 首次通关
  firstClearRewarded: boolean;
  challenge: FloorChallengeState;
  waves: WaveState[];
  currentWave: number;
  nextWaveAt: number;
  // 刷金
  isGoldFloor: boolean;
}

// 英雄养成数据
export interface HeroState {
  owned: boolean;
  enabled: boolean;
  level: number;
  star: number;
  weapon: string | null; // 装备实例 id
  armor: string | null;
  trinket: string | null;
}

// 宝石（背包中的单个宝石实例）
export type GemType = 'attack' | 'health' | 'defense' | 'haste' | 'critical' | 'gold';

export interface GemInstance {
  id: string;
  type: GemType;
  level: number; // 1..5
  locked: boolean;
}

// 装备实例
export type EquipmentRarity = 'common' | 'rare' | 'epic';
export type EquipmentSlot = 'weapon' | 'armor' | 'trinket';

export interface EquipmentInstance {
  id: string;
  templateId: string;
  rarity: EquipmentRarity;
  slot: EquipmentSlot;
  level: number; // 强化等级
  locked: boolean;
  equippedBy: string | null; // hero id
  // 属性加成
  atkBonus: number;
  hpBonus: number;
  defBonus: number;
}

// 召唤勇者养成
export interface SummonState {
  inventory: number; // 当前可用库存（内部为浮点累积，展示取整）
  inventoryMax: number;
  regenPerSec: number;
  aliveMax: number;
  attackLevel: number;
  hpLevel: number;
  stockLevel: number;
  regenLevel: number;
  aliveLevel: number;
  autoEnabled: boolean;
  autoTargetFloor: number | null;
  spawnCooldown: number; // 单次生成间隔计时
}

// 主动技能
export interface ActiveSkillState {
  battleCryCooldown: number;
  lifeEchoCooldown: number;
  crystalRainCooldown: number;
}

// 资源
export interface Resources {
  gold: number;
  crystal: number;
  recruitTickets: number;
  soulShards: Record<string, number>;
  upgradeDust: number;
}

// 任务/成就
export interface QuestState {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface AchievementState {
  id: string;
  progress: number;
  claimed: boolean;
  unlockedAt: number;
}

// 据点
export interface StrongholdSite {
  id: string;
  conquered: boolean;
  level: number;
  lastCollectAt: number; // 上次领取时间（模拟秒）
  stored: number; // 累积产出（待领取）
}

export interface StrongholdState {
  sites: Record<string, StrongholdSite>;
}

// 竞技场
export interface ArenaState {
  wins: number;
  dailyWins: number;
  lastDailyReset: number;
  bestTime: number;
}

// 设置
export interface SettingsState {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mute: boolean;
  reduceFx: boolean;
  reduceShake: boolean;
  reduceNumbers: boolean;
  autoSaveSec: number;
}

// 顶层游戏状态
export type GameMode = 'endless' | 'classic';

export interface GameState {
  schemaVersion: number;
  contentVersion: number;
  revision: number;
  seed: number;
  rng: RngState;
  time: number; // 已模拟秒数（逻辑时间）
  accountedThrough: number; // 离线金币已结算边界（真实 epoch 秒）
  nextUnitId: number;
  mode: GameMode;

  resources: Resources;
  heroes: Record<string, HeroState>;
  heroOrder: string[];
  heroDeployAt: number;
  lastHeroDeployed: string | null;
  summon: SummonState;
  gems: GemInstance[];
  gemBoard: (GemInstance | null)[]; // 8 槽
  equipment: EquipmentInstance[];
  activeSkills: ActiveSkillState;

  floors: Record<number, FloorState>;
  units: UnitState[];
  maxFloorUnlocked: number; // 已解锁的最高层号
  highestClearedFloor: number; // 已首通的最高层号

  recruitCount: number; // 累计招募次数
  goldFloor: number | null; // 玩家选择的刷金层
  selectedFloor: number | null; // 当前选中楼层（技能目标）

  quests: Record<string, QuestState>;
  achievements: Record<string, AchievementState>;
  stronghold: StrongholdState;
  arena: ArenaState;
  settings: SettingsState;

  // 离线收益率缓存
  offlineRateCache: {
    key: string;
    rate: number;
    at: number;
  } | null;

  // 离线收益结算（展示用）
  lastOfflineReward?: { seconds: number; gold: number; at: number };
  offlineRewardPending?: boolean;
}

// 领域事件（供 UI / 音效 / 任务订阅）
export interface DomainEvent {
  type: string;
  at: number;
  [key: string]: unknown;
}
