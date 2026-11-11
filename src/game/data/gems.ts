// 宝石配置 —— 六类，全队共享八槽宝石板。
import type { GemType } from '../core/types';
import { BALANCE } from './economy';

export interface GemConfig {
  type: GemType;
  name: string;
  iconId: string;
  color: string;
  level1: { kind: 'percent' | 'flat' | 'points'; value: number };
  desc: string;
}

export const GEMS: Record<GemType, GemConfig> = {
  attack: {
    type: 'attack', name: '攻击宝石', iconId: 'gem_attack', color: '#c95a4a',
    level1: { kind: 'percent', value: 0.08 },
    desc: '全队攻击提升',
  },
  health: {
    type: 'health', name: '生命宝石', iconId: 'gem_health', color: '#54CFB0',
    level1: { kind: 'percent', value: 0.08 },
    desc: '全队生命提升',
  },
  defense: {
    type: 'defense', name: '防御宝石', iconId: 'gem_defense', color: '#81C9EA',
    level1: { kind: 'flat', value: 4 },
    desc: '全队防御提升',
  },
  haste: {
    type: 'haste', name: '急速宝石', iconId: 'gem_haste', color: '#d9a23a',
    level1: { kind: 'percent', value: 0.03 },
    desc: '全队攻击速度提升',
  },
  critical: {
    type: 'critical', name: '暴击宝石', iconId: 'gem_critical', color: '#A58BCB',
    level1: { kind: 'points', value: 3 },
    desc: '全队暴击率提升',
  },
  gold: {
    type: 'gold', name: '金币宝石', iconId: 'gem_gold', color: '#e0b53a',
    level1: { kind: 'percent', value: 0.1 },
    desc: '金币收益提升',
  },
};

export const GEM_ORDER: GemType[] = ['attack', 'health', 'defense', 'haste', 'critical', 'gold'];

// 攻击/生命/防御 每级乘 1.7；急速/暴击/金币 每级乘 1.5
export function gemMultiplier(type: GemType, level: number): number {
  const growth =
    type === 'attack' || type === 'health' || type === 'defense'
      ? BALANCE.gemPercentGrowth
      : BALANCE.gemMinorGrowth;
  return Math.pow(growth, level - 1);
}

export function gemEffectValue(type: GemType, level: number): number {
  const base = GEMS[type].level1.value;
  return base * gemMultiplier(type, level);
}

export function gemFuseCost(level: number): number {
  return BALANCE.gemFuseCostBase * Math.pow(BALANCE.gemFuseCostGrowth, level - 1);
}

// 计算全队宝石总加成
export interface GemTotals {
  atkPct: number;
  hpPct: number;
  defFlat: number;
  hastePct: number;
  critPoints: number;
  goldPct: number;
}

export function sumBoardGems(board: (import('../core/types').GemInstance | null)[]): GemTotals {
  const totals: GemTotals = { atkPct: 0, hpPct: 0, defFlat: 0, hastePct: 0, critPoints: 0, goldPct: 0 };
  for (const g of board) {
    if (!g) continue;
    const v = gemEffectValue(g.type, g.level);
    switch (g.type) {
      case 'attack': totals.atkPct += v; break;
      case 'health': totals.hpPct += v; break;
      case 'defense': totals.defFlat += v; break;
      case 'haste': totals.hastePct += v; break;
      case 'critical': totals.critPoints += v / 100; break; // 3 个百分点 => 0.03
      case 'gold': totals.goldPct += v; break;
    }
  }
  return totals;
}

export function countBoardGems(board: (import('../core/types').GemInstance | null)[]): number {
  return board.filter(Boolean).length;
}
