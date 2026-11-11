// 任务与成就配置
export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  target: number;
  metric: QuestMetric;
  reward: { gold?: number; crystal?: number; recruitTickets?: number };
}

export type QuestMetric =
  | 'summon_count'
  | 'upgrade_count'
  | 'recruit_count'
  | 'gem_equip_count'
  | 'gem_fuse_count'
  | 'boss_kill_count'
  | 'max_floor'
  | 'kill_count'
  | 'gold_earned';

export const QUESTS: QuestDef[] = [
  { id: 'q_first_summon', name: '首次召唤', desc: '投放第一名勇者', target: 1, metric: 'summon_count', reward: { gold: 50 } },
  { id: 'q_first_upgrade', name: '首次升级', desc: '进行一次升级', target: 1, metric: 'upgrade_count', reward: { gold: 50 } },
  { id: 'q_first_recruit', name: '首次招募', desc: '招募一名英雄', target: 1, metric: 'recruit_count', reward: { crystal: 5 } },
  { id: 'q_first_gem', name: '首次宝石装备', desc: '装备一颗宝石', target: 1, metric: 'gem_equip_count', reward: { crystal: 5 } },
  { id: 'q_first_fuse', name: '首次合成', desc: '合成一颗宝石', target: 1, metric: 'gem_fuse_count', reward: { gold: 200 } },
  { id: 'q_boss_1', name: '击败 Boss', desc: '击败一名关口 Boss', target: 1, metric: 'boss_kill_count', reward: { crystal: 10 } },
  { id: 'q_floor_10', name: '第十层', desc: '首通第 10 层', target: 10, metric: 'max_floor', reward: { gold: 300 } },
  { id: 'q_floor_50', name: '第五十层', desc: '首通第 50 层', target: 50, metric: 'max_floor', reward: { crystal: 20 } },
  { id: 'q_floor_100', name: '第一百层', desc: '首通第 100 层', target: 100, metric: 'max_floor', reward: { crystal: 50 } },
  { id: 'q_floor_200', name: '第两百层', desc: '首通第 200 层', target: 200, metric: 'max_floor', reward: { crystal: 100 } },
  { id: 'q_floor_300', name: '第三百层', desc: '首通第 300 层', target: 300, metric: 'max_floor', reward: { crystal: 300 } },
  { id: 'q_kill_100', name: '累计击杀', desc: '累计击杀 100 名敌人', target: 100, metric: 'kill_count', reward: { gold: 500 } },
  { id: 'q_gold_1000', name: '累计金币', desc: '累计获得 1000 金币', target: 1000, metric: 'gold_earned', reward: { gold: 300 } },
];

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  target: number;
  metric: QuestMetric;
  reward: { crystal?: number; recruitTickets?: number };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_floor_10', name: '初入塔', desc: '首通第 10 层', target: 10, metric: 'max_floor', reward: { crystal: 10 } },
  { id: 'a_floor_50', name: '稳步上升', desc: '首通第 50 层', target: 50, metric: 'max_floor', reward: { crystal: 20 } },
  { id: 'a_floor_100', name: '百层登临', desc: '首通第 100 层', target: 100, metric: 'max_floor', reward: { crystal: 50 } },
  { id: 'a_floor_200', name: '高塔之巅', desc: '首通第 200 层', target: 200, metric: 'max_floor', reward: { crystal: 100 } },
  { id: 'a_floor_300', name: '晶塔之主', desc: '首通第 300 层', target: 300, metric: 'max_floor', reward: { recruitTickets: 5 } },
  { id: 'a_kill_1000', name: '清剿者', desc: '累计击杀 1000 名敌人', target: 1000, metric: 'kill_count', reward: { crystal: 30 } },
  { id: 'a_boss_10', name: 'Boss 猎手', desc: '累计击败 10 名 Boss', target: 10, metric: 'boss_kill_count', reward: { crystal: 50 } },
];
