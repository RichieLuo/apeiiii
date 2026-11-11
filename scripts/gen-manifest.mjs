// 生成 assets/manifest.json —— 资源清单（id/path/kind/approvalStatus 等）
import { writeFileSync, mkdirSync } from 'fs';

// 资源 ID 清单（按附件第三部分 90 项）
const defs = [];
const add = (id, path, kind) => defs.push({ id, path, kind });

// 英雄
const heroes = ['hero_guard', 'hero_archer', 'hero_fire_mage', 'hero_healer', 'hero_assassin', 'hero_engineer', 'hero_ice_mage', 'hero_banner'];
heroes.forEach((h) => add(h, `assets/sprites/heroes/${h}.png`, 'character'));
add('unit_summon_squire', 'assets/sprites/units/unit_summon_squire.png', 'character');
add('unit_copper_turret', 'assets/sprites/units/unit_copper_turret.png', 'character');
// 怪物
const monsters = ['enemy_moss_blob', 'enemy_cave_bat', 'enemy_iron_beetle', 'enemy_bone_soldier', 'enemy_miner_golem', 'enemy_fire_lizard', 'enemy_ash_sprite', 'enemy_charred_guard', 'enemy_frost_wolf', 'enemy_snow_wisp', 'enemy_ice_sentinel', 'enemy_crystal_spider'];
monsters.forEach((m) => add(m, `assets/sprites/enemies/${m}.png`, 'character'));
const bosses = ['boss_gate_colossus', 'boss_furnace_golem', 'boss_prism_warden'];
bosses.forEach((b) => add(b, `assets/sprites/bosses/${b}.png`, 'character'));
// 场景
add('bg_tower_ruins', 'assets/backgrounds/bg_tower_ruins.png', 'background');
add('bg_tower_forge', 'assets/backgrounds/bg_tower_forge.png', 'background');
add('bg_tower_frost', 'assets/backgrounds/bg_tower_frost.png', 'background');
// 建筑模块
add('prop_platform', 'assets/props/prop_platform.png', 'prop');
add('prop_door_ruins', 'assets/props/prop_door_ruins.png', 'prop');
add('prop_door_forge', 'assets/props/prop_door_forge.png', 'prop');
add('prop_door_frost', 'assets/props/prop_door_frost.png', 'prop');
add('prop_stairs', 'assets/props/prop_stairs.png', 'prop');
// 宝石
['attack', 'health', 'defense', 'haste', 'critical', 'gold'].forEach((g) => add(`gem_${g}`, `assets/icons/gems/gem_${g}.png`, 'icon'));
// 货币与物品
const items = ['currency_gold', 'currency_crystal', 'currency_recruit_ticket', 'currency_soul_shard', 'currency_upgrade_dust', 'item_sword', 'item_bow', 'item_staff', 'item_daggers', 'item_wrench', 'item_banner', 'item_armor', 'item_robe', 'item_amulet', 'item_chest'];
items.forEach((i) => add(i, `assets/icons/items/${i}.png`, 'icon'));
// 技能图标
const skills = ['skill_guard', 'skill_archer', 'skill_fire_mage', 'skill_healer', 'skill_assassin', 'skill_engineer', 'skill_ice_mage', 'skill_banner', 'skill_battle_cry', 'skill_life_echo', 'skill_crystal_rain'];
skills.forEach((s) => add(s, `assets/icons/skills/${s}.png`, 'icon'));
// 特效
const vfx = ['fx_hit', 'fx_slash', 'fx_fireball', 'fx_ice', 'fx_heal', 'fx_summon', 'fx_gold', 'fx_fusion', 'fx_shield'];
vfx.forEach((v) => add(v, `assets/vfx/${v}.png`, 'vfx'));
// UI
add('ui_panel_frame', 'assets/ui/ui_panel_frame.png', 'ui');
add('ui_crystal_corner', 'assets/ui/ui_crystal_corner.png', 'ui');
add('app_mark', 'assets/ui/app_mark.png', 'ui');
add('screen_loading', 'assets/screens/screen_loading.png', 'screen');
add('concept_main_screen', 'assets/concepts/concept_main_screen.png', 'screen');
// 攻击姿势（参考基准图约束生成）
const attacks = ['hero_guard', 'hero_archer', 'hero_fire_mage', 'hero_healer', 'hero_assassin', 'hero_engineer', 'hero_ice_mage', 'hero_banner'];
attacks.forEach((a) => add(`${a}_attack`, `assets/sprites/heroes/${a}_attack.png`, 'character'));
['boss_gate_colossus', 'boss_furnace_golem', 'boss_prism_warden'].forEach((b) => add(`${b}_attack`, `assets/sprites/bosses/${b}_attack.png`, 'character'));

// 已生成并接入的资源（approvalStatus = approved）
const generated = new Set([
  'hero_guard', 'hero_archer', 'hero_fire_mage', 'hero_healer', 'hero_assassin', 'hero_engineer', 'hero_ice_mage', 'hero_banner',
  'unit_summon_squire', 'unit_copper_turret',
  'enemy_moss_blob', 'enemy_cave_bat', 'enemy_iron_beetle', 'enemy_bone_soldier', 'enemy_miner_golem',
  'enemy_fire_lizard', 'enemy_ash_sprite', 'enemy_charred_guard', 'enemy_frost_wolf', 'enemy_snow_wisp', 'enemy_ice_sentinel', 'enemy_crystal_spider',
  'boss_gate_colossus', 'boss_furnace_golem', 'boss_prism_warden',
  'bg_tower_ruins', 'bg_tower_forge', 'bg_tower_frost',
  'gem_attack', 'gem_health',
]);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  assets: defs.map((d) => ({
    id: d.id,
    path: d.path,
    kind: d.kind,
    sourcePath: generated.has(d.id) ? `art/source/${d.id}.png` : null,
    sourceSize: null,
    frameSize: d.kind === 'character' && d.id.startsWith('boss') ? [512, 512] : d.kind === 'character' ? [256, 256] : [128, 128],
    displaySize: null,
    hasAlpha: d.kind !== 'background' && d.kind !== 'screen',
    pivot: d.kind === 'character' ? [0.5, 0.875] : [0.5, 0.5],
    facing: d.id.startsWith('enemy') || d.id.startsWith('boss') ? 'left' : 'right',
    animationMode: 'procedural',
    frames: null,
    frameDurationsMs: null,
    atlas: null,
    promptId: `ART-${d.id}`,
    promptVersion: 1,
    approvalStatus: generated.has(d.id) ? 'approved' : 'pending',
  })),
};

mkdirSync('public/assets', { recursive: true });
writeFileSync('public/assets/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`manifest.json 已生成，共 ${defs.length} 项资源，其中已接入 ${generated.size} 项`);
