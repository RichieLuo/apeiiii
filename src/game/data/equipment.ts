// 简化装备配置 —— 三档稀有度，武器/护具/饰品三槽。
import type { EquipmentRarity, EquipmentSlot } from '../core/types';

export interface EquipmentTemplate {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  iconId: string;
  atkBonus: number;
  hpBonus: number;
  defBonus: number;
}

export const EQUIPMENT_TEMPLATES: Record<string, EquipmentTemplate> = {
  // 武器
  item_sword_common: { id: 'item_sword_common', name: '普通短剑', slot: 'weapon', rarity: 'common', iconId: 'item_sword', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_sword_rare: { id: 'item_sword_rare', name: '精良短剑', slot: 'weapon', rarity: 'rare', iconId: 'item_sword', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_sword_epic: { id: 'item_sword_epic', name: '稀有短剑', slot: 'weapon', rarity: 'epic', iconId: 'item_sword', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_bow_common: { id: 'item_bow_common', name: '普通木弓', slot: 'weapon', rarity: 'common', iconId: 'item_bow', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_bow_rare: { id: 'item_bow_rare', name: '精良木弓', slot: 'weapon', rarity: 'rare', iconId: 'item_bow', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_bow_epic: { id: 'item_bow_epic', name: '稀有木弓', slot: 'weapon', rarity: 'epic', iconId: 'item_bow', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_staff_common: { id: 'item_staff_common', name: '普通法杖', slot: 'weapon', rarity: 'common', iconId: 'item_staff', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_staff_rare: { id: 'item_staff_rare', name: '精良法杖', slot: 'weapon', rarity: 'rare', iconId: 'item_staff', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_staff_epic: { id: 'item_staff_epic', name: '稀有法杖', slot: 'weapon', rarity: 'epic', iconId: 'item_staff', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_daggers_common: { id: 'item_daggers_common', name: '普通匕首', slot: 'weapon', rarity: 'common', iconId: 'item_daggers', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_daggers_rare: { id: 'item_daggers_rare', name: '精良匕首', slot: 'weapon', rarity: 'rare', iconId: 'item_daggers', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_daggers_epic: { id: 'item_daggers_epic', name: '稀有匕首', slot: 'weapon', rarity: 'epic', iconId: 'item_daggers', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_wrench_common: { id: 'item_wrench_common', name: '普通扳手', slot: 'weapon', rarity: 'common', iconId: 'item_wrench', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_wrench_rare: { id: 'item_wrench_rare', name: '精良扳手', slot: 'weapon', rarity: 'rare', iconId: 'item_wrench', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_wrench_epic: { id: 'item_wrench_epic', name: '稀有扳手', slot: 'weapon', rarity: 'epic', iconId: 'item_wrench', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_banner_common: { id: 'item_banner_common', name: '普通战旗', slot: 'weapon', rarity: 'common', iconId: 'item_banner', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_banner_rare: { id: 'item_banner_rare', name: '精良战旗', slot: 'weapon', rarity: 'rare', iconId: 'item_banner', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_banner_epic: { id: 'item_banner_epic', name: '稀有战旗', slot: 'weapon', rarity: 'epic', iconId: 'item_banner', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_spear_common: { id: 'item_spear_common', name: '普通长枪', slot: 'weapon', rarity: 'common', iconId: 'item_spear', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_spear_rare: { id: 'item_spear_rare', name: '精良长枪', slot: 'weapon', rarity: 'rare', iconId: 'item_spear', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_spear_epic: { id: 'item_spear_epic', name: '稀有长枪', slot: 'weapon', rarity: 'epic', iconId: 'item_spear', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_musket_common: { id: 'item_musket_common', name: '普通火铳', slot: 'weapon', rarity: 'common', iconId: 'item_musket', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_musket_rare: { id: 'item_musket_rare', name: '精良火铳', slot: 'weapon', rarity: 'rare', iconId: 'item_musket', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_musket_epic: { id: 'item_musket_epic', name: '稀有火铳', slot: 'weapon', rarity: 'epic', iconId: 'item_musket', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_flask_common: { id: 'item_flask_common', name: '普通药剂瓶', slot: 'weapon', rarity: 'common', iconId: 'item_flask', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_flask_rare: { id: 'item_flask_rare', name: '精良药剂瓶', slot: 'weapon', rarity: 'rare', iconId: 'item_flask', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_flask_epic: { id: 'item_flask_epic', name: '稀有药剂瓶', slot: 'weapon', rarity: 'epic', iconId: 'item_flask', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  item_bracers_common: { id: 'item_bracers_common', name: '普通拳套', slot: 'weapon', rarity: 'common', iconId: 'item_bracers', atkBonus: 5, hpBonus: 0, defBonus: 0 },
  item_bracers_rare: { id: 'item_bracers_rare', name: '精良拳套', slot: 'weapon', rarity: 'rare', iconId: 'item_bracers', atkBonus: 12, hpBonus: 0, defBonus: 0 },
  item_bracers_epic: { id: 'item_bracers_epic', name: '稀有拳套', slot: 'weapon', rarity: 'epic', iconId: 'item_bracers', atkBonus: 22, hpBonus: 0, defBonus: 0 },
  // 护具
  item_armor_common: { id: 'item_armor_common', name: '普通护具', slot: 'armor', rarity: 'common', iconId: 'item_armor', atkBonus: 0, hpBonus: 40, defBonus: 2 },
  item_armor_rare: { id: 'item_armor_rare', name: '精良护具', slot: 'armor', rarity: 'rare', iconId: 'item_armor', atkBonus: 0, hpBonus: 100, defBonus: 5 },
  item_armor_epic: { id: 'item_armor_epic', name: '稀有护具', slot: 'armor', rarity: 'epic', iconId: 'item_armor', atkBonus: 0, hpBonus: 180, defBonus: 9 },
  // 饰品
  item_amulet_common: { id: 'item_amulet_common', name: '普通吊坠', slot: 'trinket', rarity: 'common', iconId: 'item_amulet', atkBonus: 3, hpBonus: 20, defBonus: 0 },
  item_amulet_rare: { id: 'item_amulet_rare', name: '精良吊坠', slot: 'trinket', rarity: 'rare', iconId: 'item_amulet', atkBonus: 8, hpBonus: 50, defBonus: 1 },
  item_amulet_epic: { id: 'item_amulet_epic', name: '稀有吊坠', slot: 'trinket', rarity: 'epic', iconId: 'item_amulet', atkBonus: 15, hpBonus: 90, defBonus: 2 },
  // 袍（饰品槽通用护具类，归属饰品）
  item_robe_common: { id: 'item_robe_common', name: '普通法袍', slot: 'armor', rarity: 'common', iconId: 'item_robe', atkBonus: 0, hpBonus: 35, defBonus: 1 },
  item_robe_rare: { id: 'item_robe_rare', name: '精良法袍', slot: 'armor', rarity: 'rare', iconId: 'item_robe', atkBonus: 0, hpBonus: 90, defBonus: 4 },
  item_robe_epic: { id: 'item_robe_epic', name: '稀有法袍', slot: 'armor', rarity: 'epic', iconId: 'item_robe', atkBonus: 0, hpBonus: 160, defBonus: 8 },
};

export const RARITY_ORDER: EquipmentRarity[] = ['common', 'rare', 'epic'];

export const RARITY_COLORS: Record<EquipmentRarity, string> = {
  common: '#9aa7b0',
  rare: '#54CFB0',
  epic: '#D9AD64',
};

export const RARITY_NAMES: Record<EquipmentRarity, string> = {
  common: '普通',
  rare: '精良',
  epic: '稀有',
};

export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: '武器',
  armor: '护具',
  trinket: '饰品',
};

export function weaponTemplateFor(heroId: string, rarity: EquipmentRarity): EquipmentTemplate {
  const weaponKind: Record<string, string> = {
    hero_guard: 'item_sword',
    hero_archer: 'item_bow',
    hero_fire_mage: 'item_staff',
    hero_healer: 'item_staff',
    hero_assassin: 'item_daggers',
    hero_engineer: 'item_wrench',
    hero_ice_mage: 'item_staff',
    hero_banner: 'item_banner',
    hero_lancer: 'item_spear',
    hero_musketeer: 'item_musket',
    hero_alchemist: 'item_flask',
    hero_sun_monk: 'item_bracers',
    hero_paladin: 'item_wrench',
    hero_berserker: 'item_daggers',
    hero_duelist: 'item_sword',
    hero_hammer: 'item_wrench',
    hero_reaper: 'item_spear',
    hero_samurai: 'item_sword',
    hero_druid: 'item_staff',
    hero_crossbow: 'item_bow',
    hero_storm_mage: 'item_staff',
    hero_warlock: 'item_staff',
    hero_bard: 'item_banner',
    hero_oracle: 'item_staff',
  };
  const base = weaponKind[heroId] ?? 'item_sword';
  return EQUIPMENT_TEMPLATES[`${base}_${rarity}`];
}
