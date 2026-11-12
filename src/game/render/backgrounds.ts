import { BALANCE } from '../data/economy';

// 场景美术按十层区段切换；独立于怪物生态分区，不影响战斗或旧存档。
export const BACKGROUND_FLOORS = BALANCE.floorsPerGate;

export const BACKGROUND_THEMES = [
  { texture: 'bg_tower_ruins', name: '苔藓遗迹', background: 0x24313b, platform: 0x526675, accent: 0x9eaf82 },
  { texture: 'bg_tower_grotto', name: '荧光菌窟', background: 0x211c35, platform: 0x514969, accent: 0x9fd8db },
  { texture: 'bg_tower_tidal', name: '潮汐水殿', background: 0x17343c, platform: 0x3e6e75, accent: 0x83d7cd },
  { texture: 'bg_tower_tomb', name: '金沙陵墓', background: 0x382a1d, platform: 0x927451, accent: 0xe5c58b },
  { texture: 'bg_tower_forge', name: '熔炉塔区', background: 0x2c1f1a, platform: 0x6a5040, accent: 0xe7a06b },
  { texture: 'bg_tower_clockwork', name: '黄铜工坊', background: 0x30281e, platform: 0x74634b, accent: 0xd9bf83 },
  { texture: 'bg_tower_frost', name: '冰晶高塔', background: 0x1f2b38, platform: 0x4a6a80, accent: 0xa1d9ee },
  { texture: 'bg_tower_library', name: '秘法书库', background: 0x29213c, platform: 0x65537c, accent: 0xc3a6ee },
  { texture: 'bg_tower_sanctuary', name: '云海圣殿', background: 0x374452, platform: 0x8996a3, accent: 0xf1deae },
  { texture: 'bg_tower_astral', name: '星渊天穹', background: 0x171c38, platform: 0x44466f, accent: 0xb3b9f2 },
] as const;

export function backgroundThemeForFloor(floorId: number) {
  const segment = Math.floor((Math.max(1, floorId) - 1) / BACKGROUND_FLOORS);
  return BACKGROUND_THEMES[segment % BACKGROUND_THEMES.length];
}

export function backgroundSegmentTop(floorId: number): number {
  return Math.ceil(Math.max(1, floorId) / BACKGROUND_FLOORS) * BACKGROUND_FLOORS;
}
