// 怪物与 Boss 配置 —— 名称与数值均为本版原创设计。
import type { UnitKind } from '../core/types';

export interface MonsterConfig {
  id: string;
  name: string;
  region: number; // 1..3 对应区域
  kind: UnitKind; // 'enemy' | 'boss'
  flying: boolean;
  hpFactor: number; // 生命职业系数
  atkFactor: number; // 攻击职业系数
  defFactor: number; // 防御职业系数
  attackInterval: number;
  range: number; // 0 表示近战
  melee: boolean;
  moveSpeed: number;
  critChance: number;
  critMult: number;
  behavior: string; // 特殊行为标签
  spriteId: string;
  color: string;
  desc: string;
  // Boss 专属
  boss?: {
    hpMult: number;
    atkMult: number;
    goldMult: number;
    skill: 'colossus' | 'furnace' | 'prism';
    skillInterval: number;
    skillDesc: string;
  };
}

export const MONSTERS: Record<string, MonsterConfig> = {
  enemy_moss_blob: {
    id: 'enemy_moss_blob', name: '苔藓团', region: 1, kind: 'enemy', flying: false,
    hpFactor: 1.0, atkFactor: 0.9, defFactor: 0.6,
    attackInterval: 1.4, range: 0, melee: true, moveSpeed: 26,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_moss_blob', color: '#6a9a5a', desc: '低速近战的新手基础敌人。',
  },
  enemy_cave_bat: {
    id: 'enemy_cave_bat', name: '洞穴蝠', region: 1, kind: 'enemy', flying: true,
    hpFactor: 0.7, atkFactor: 1.0, defFactor: 0.3,
    attackInterval: 0.9, range: 0, melee: true, moveSpeed: 62,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_cave_bat', color: '#7a6a9a', desc: '脆皮高速的飞行敌人。',
  },
  enemy_iron_beetle: {
    id: 'enemy_iron_beetle', name: '铁壳虫', region: 1, kind: 'enemy', flying: false,
    hpFactor: 1.1, atkFactor: 0.9, defFactor: 1.6,
    attackInterval: 1.5, range: 0, melee: true, moveSpeed: 24,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_iron_beetle', color: '#5a6a7a', desc: '低速高防御的甲虫。',
  },
  enemy_bone_soldier: {
    id: 'enemy_bone_soldier', name: '骨兵', region: 1, kind: 'enemy', flying: false,
    hpFactor: 1.0, atkFactor: 1.0, defFactor: 1.0,
    attackInterval: 1.1, range: 0, melee: true, moveSpeed: 34,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_bone_soldier', color: '#c9c2b0', desc: '均衡近战敌人。',
  },
  enemy_miner_golem: {
    id: 'enemy_miner_golem', name: '矿工傀儡', region: 1, kind: 'enemy', flying: false,
    hpFactor: 1.6, atkFactor: 1.1, defFactor: 1.0,
    attackInterval: 1.6, range: 0, melee: true, moveSpeed: 22,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_miner_golem', color: '#7a7a7a', desc: '高生命慢攻击的傀儡。',
  },
  enemy_bramble_boar: {
    id: 'enemy_bramble_boar', name: '荆背野猪', region: 1, kind: 'enemy', flying: false,
    hpFactor: 1.12, atkFactor: 1.05, defFactor: 0.75,
    attackInterval: 1.25, range: 0, melee: true, moveSpeed: 54,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_bramble_boar', color: '#557449', desc: '用獠牙攻击的野猪，能迅速逼近前排。',
  },
  enemy_ruin_hexer: {
    id: 'enemy_ruin_hexer', name: '遗迹咒师', region: 1, kind: 'enemy', flying: false,
    hpFactor: 0.68, atkFactor: 0.95, defFactor: 0.45,
    attackInterval: 1.55, range: 225, melee: false, moveSpeed: 32,
    critChance: 0, critMult: 1.5, behavior: 'ranged',
    spriteId: 'enemy_ruin_hexer', color: '#617e72', desc: '用骨杖从远处施法，防御较弱。',
  },
  enemy_fire_lizard: {
    id: 'enemy_fire_lizard', name: '火蜥', region: 2, kind: 'enemy', flying: false,
    hpFactor: 0.9, atkFactor: 1.05, defFactor: 0.7,
    attackInterval: 0.8, range: 0, melee: true, moveSpeed: 56,
    critChance: 0, critMult: 1.5, behavior: 'burn',
    spriteId: 'enemy_fire_lizard', color: '#a84a30', desc: '快速近战，带短持续灼烧。',
  },
  enemy_ash_sprite: {
    id: 'enemy_ash_sprite', name: '灰烬精', region: 2, kind: 'enemy', flying: true,
    hpFactor: 0.65, atkFactor: 1.0, defFactor: 0.3,
    attackInterval: 1.3, range: 260, melee: false, moveSpeed: 40,
    critChance: 0, critMult: 1.5, behavior: 'ranged',
    spriteId: 'enemy_ash_sprite', color: '#8a6a5a', desc: '脆皮远程火弹。',
  },
  enemy_charred_guard: {
    id: 'enemy_charred_guard', name: '焦岩兵', region: 2, kind: 'enemy', flying: false,
    hpFactor: 1.3, atkFactor: 1.3, defFactor: 1.5,
    attackInterval: 1.8, range: 0, melee: true, moveSpeed: 26,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_charred_guard', color: '#5a4a44', desc: '高防御低频重击。',
  },
  enemy_cinder_moth: {
    id: 'enemy_cinder_moth', name: '烬纹蛾', region: 2, kind: 'enemy', flying: true,
    hpFactor: 0.72, atkFactor: 0.84, defFactor: 0.4,
    attackInterval: 1.55, range: 240, melee: false, moveSpeed: 52,
    critChance: 0, critMult: 1.5, behavior: 'burn',
    spriteId: 'enemy_cinder_moth', color: '#ab6546', desc: '飞行敌人，远程攻击会附加短时灼烧。',
  },
  enemy_slag_crab: {
    id: 'enemy_slag_crab', name: '熔渣蟹', region: 2, kind: 'enemy', flying: false,
    hpFactor: 1.25, atkFactor: 1.0, defFactor: 1.8,
    attackInterval: 1.5, range: 0, melee: true, moveSpeed: 20,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_slag_crab', color: '#70504a', desc: '有厚重的黑曜石甲壳，用巨钳近战。',
  },
  enemy_frost_wolf: {
    id: 'enemy_frost_wolf', name: '霜狼', region: 3, kind: 'enemy', flying: false,
    hpFactor: 0.9, atkFactor: 1.15, defFactor: 0.8,
    attackInterval: 0.7, range: 0, melee: true, moveSpeed: 66,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_frost_wolf', color: '#7a8a9a', desc: '高速突进敌人。',
  },
  enemy_snow_wisp: {
    id: 'enemy_snow_wisp', name: '雪幽', region: 3, kind: 'enemy', flying: true,
    hpFactor: 0.75, atkFactor: 1.0, defFactor: 0.4,
    attackInterval: 1.3, range: 270, melee: false, moveSpeed: 38,
    critChance: 0, critMult: 1.5, behavior: 'slow',
    spriteId: 'enemy_snow_wisp', color: '#9ab0c9', desc: '远程减速敌人。',
  },
  enemy_ice_sentinel: {
    id: 'enemy_ice_sentinel', name: '冰甲兵', region: 3, kind: 'enemy', flying: false,
    hpFactor: 1.3, atkFactor: 1.05, defFactor: 1.7,
    attackInterval: 1.4, range: 0, melee: true, moveSpeed: 30,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_ice_sentinel', color: '#4a7a8a', desc: '高防御近战。',
  },
  enemy_crystal_spider: {
    id: 'enemy_crystal_spider', name: '晶核蛛', region: 3, kind: 'enemy', flying: false,
    hpFactor: 0.7, atkFactor: 1.1, defFactor: 0.5,
    attackInterval: 1.2, range: 250, melee: false, moveSpeed: 34,
    critChance: 0, critMult: 1.5, behavior: 'ranged',
    spriteId: 'enemy_crystal_spider', color: '#5a6a8a', desc: '远程晶弹，低生命。',
  },
  enemy_rime_ram: {
    id: 'enemy_rime_ram', name: '白霜岩羊', region: 3, kind: 'enemy', flying: false,
    hpFactor: 1.18, atkFactor: 1.26, defFactor: 0.9,
    attackInterval: 1.8, range: 0, melee: true, moveSpeed: 54,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'enemy_rime_ram', color: '#68839e', desc: '快速靠近后以卷角重击，攻击间隔较长。',
  },
  enemy_glacier_oracle: {
    id: 'enemy_glacier_oracle', name: '冰川祭司', region: 3, kind: 'enemy', flying: false,
    hpFactor: 1.0, atkFactor: 1.24, defFactor: 0.7,
    attackInterval: 1.85, range: 285, melee: false, moveSpeed: 28,
    critChance: 0, critMult: 1.5, behavior: 'ranged',
    spriteId: 'enemy_glacier_oracle', color: '#7c95b5', desc: '缓慢行进的远程施法者，单次攻击伤害较高。',
  },
  boss_gate_colossus: {
    id: 'boss_gate_colossus', name: '门卫石像', region: 1, kind: 'boss', flying: false,
    hpFactor: 1.0, atkFactor: 1.0, defFactor: 1.2,
    attackInterval: 1.6, range: 0, melee: true, moveSpeed: 18,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'boss_gate_colossus', color: '#6a7a7a', desc: '护盾与扇形重击，重击前 1 秒预警。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'colossus', skillInterval: 9, skillDesc: '扇形重击，前摇 1 秒预警' },
  },
  boss_furnace_golem: {
    id: 'boss_furnace_golem', name: '熔炉魔像', region: 2, kind: 'boss', flying: false,
    hpFactor: 1.0, atkFactor: 1.0, defFactor: 1.2,
    attackInterval: 1.5, range: 0, melee: true, moveSpeed: 18,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'boss_furnace_golem', color: '#8a5a3a', desc: '周期性同层火焰冲击，半血后提高攻击频率。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'furnace', skillInterval: 8, skillDesc: '同层火焰冲击，半血后更频繁' },
  },
  boss_prism_warden: {
    id: 'boss_prism_warden', name: '棱镜守望者', region: 3, kind: 'boss', flying: true,
    hpFactor: 1.0, atkFactor: 1.0, defFactor: 1.3,
    attackInterval: 1.4, range: 200, melee: false, moveSpeed: 20,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'boss_prism_warden', color: '#6a5a8a', desc: '周期性晶盾和晶弹齐射。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'prism', skillInterval: 7, skillDesc: '晶盾 + 晶弹齐射' },
  },
  boss_thorn_titan: {
    id: 'boss_thorn_titan', name: '棘根巨兽', region: 1, kind: 'boss', flying: false,
    hpFactor: 1.12, atkFactor: 0.98, defFactor: 1.35,
    attackInterval: 1.85, range: 0, melee: true, moveSpeed: 16,
    critChance: 0, critMult: 1.5, behavior: 'none',
    spriteId: 'boss_thorn_titan', color: '#557052', desc: '根须和岩石构成的巨兽，会生成护盾并重击附近敌人。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'colossus', skillInterval: 10, skillDesc: '根甲护盾与近距离重击' },
  },
  boss_cinder_drake: {
    id: 'boss_cinder_drake', name: '熔鳞火龙', region: 2, kind: 'boss', flying: false,
    hpFactor: 0.9, atkFactor: 1.08, defFactor: 1.0,
    attackInterval: 1.45, range: 0, melee: true, moveSpeed: 26,
    critChance: 0, critMult: 1.5, behavior: 'burn',
    spriteId: 'boss_cinder_drake', color: '#af5736', desc: '近战附加灼烧，半血后更频繁地向整层喷吐火焰。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'furnace', skillInterval: 9, skillDesc: '全层龙息，半血后更频繁' },
  },
  boss_glacier_lich: {
    id: 'boss_glacier_lich', name: '冻魂巫妖', region: 3, kind: 'boss', flying: true,
    hpFactor: 0.88, atkFactor: 1.1, defFactor: 1.25,
    attackInterval: 1.8, range: 250, melee: false, moveSpeed: 24,
    critChance: 0, critMult: 1.5, behavior: 'ranged',
    spriteId: 'boss_glacier_lich', color: '#7383b0', desc: '浮空施法，周期性生成冰晶护盾并齐射。',
    boss: { hpMult: 8, atkMult: 1.8, goldMult: 20, skill: 'prism', skillInterval: 6, skillDesc: '冰晶护盾与至多三个目标的齐射' },
  },
};

export const MONSTERS_BY_REGION: Record<number, string[]> = {
  1: ['enemy_moss_blob', 'enemy_cave_bat', 'enemy_iron_beetle', 'enemy_bone_soldier', 'enemy_miner_golem', 'enemy_bramble_boar', 'enemy_ruin_hexer'],
  2: ['enemy_fire_lizard', 'enemy_ash_sprite', 'enemy_charred_guard', 'enemy_cinder_moth', 'enemy_slag_crab'],
  3: ['enemy_frost_wolf', 'enemy_snow_wisp', 'enemy_ice_sentinel', 'enemy_crystal_spider', 'enemy_rime_ram', 'enemy_glacier_oracle'],
};

export const BOSS_BY_REGION: Record<number, string> = {
  1: 'boss_gate_colossus',
  2: 'boss_furnace_golem',
  3: 'boss_prism_warden',
};

export const BOSS_VARIANTS_BY_REGION: Record<number, readonly [string, string]> = {
  1: [BOSS_BY_REGION[1], 'boss_thorn_titan'],
  2: [BOSS_BY_REGION[2], 'boss_cinder_drake'],
  3: [BOSS_BY_REGION[3], 'boss_glacier_lich'],
};

export const REGION_NAMES: Record<number, string> = {
  1: '苔藓遗迹',
  2: '熔炉塔区',
  3: '冰晶高塔',
};

export function regionOfFloor(floorId: number): number {
  return Math.floor((Math.max(1, floorId) - 1) / 100) % 3 + 1;
}
