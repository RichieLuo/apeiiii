# 美术缺口清单（如实声明）

生成工具：ImageGen。早期素材的棋盘背景已经抠除；新增素材检查 PNG 的实际 alpha 通道后入库。
归一化：按图集裁切、透明留白裁切、脚底与角色高度对齐。背景棋盘不能当作透明通道使用。

## 已接入基础资源

- 英雄 24 名：hero_guard / hero_archer / hero_fire_mage / hero_healer / hero_assassin / hero_engineer / hero_ice_mage / hero_banner / hero_lancer / hero_musketeer / hero_alchemist / hero_sun_monk / hero_paladin / hero_berserker / hero_duelist / hero_hammer / hero_reaper / hero_samurai / hero_druid / hero_crossbow / hero_storm_mage / hero_warlock / hero_bard / hero_oracle
- 勇者 1：unit_summon_squire
- 炮台 1：unit_copper_turret
- 怪物 18 种：原有 12 种，以及 enemy_bramble_boar / enemy_ruin_hexer / enemy_cinder_moth / enemy_slag_crab / enemy_rime_ram / enemy_glacier_oracle
- Boss 6 名：boss_gate_colossus / boss_furnace_golem / boss_prism_warden / boss_thorn_titan / boss_cinder_drake / boss_glacier_lich
- 背景 3：bg_tower_ruins / bg_tower_forge / bg_tower_frost
- 宝石 2：gem_attack / gem_health

## 英雄动作帧

- 24 名英雄和普通勇者各有四张走路帧和一张攻击帧。
- 小步幅行走按实际移动距离播放，停步回到待机；攻击使用独立姿势。
- 部分角色的 A/B 帧左右支撑脚交替仍不够明显，后续可针对角色细修；当前四帧存在姿态差异，不能把帧数等同于步态已完全完善。

## 待补资源

完整提示词见 `art/prompts/完整提示词.txt`（第三部分，90 项逐条提示词）。

- 宝石 4：gem_defense / gem_haste / gem_critical / gem_gold
- 货币物品 15：currency_gold / currency_crystal / currency_recruit_ticket / currency_soul_shard / currency_upgrade_dust / item_sword / item_bow / item_staff / item_daggers / item_wrench / item_banner / item_armor / item_robe / item_amulet / item_chest
- 技能图标 11：skill_guard / skill_archer / skill_fire_mage / skill_healer / skill_assassin / skill_engineer / skill_ice_mage / skill_banner / skill_battle_cry / skill_life_echo / skill_crystal_rain
- 特效 9：fx_hit / fx_slash / fx_fireball / fx_ice / fx_heal / fx_summon / fx_gold / fx_fusion / fx_shield
- 建筑模块 5：prop_platform / prop_door_ruins / prop_door_forge / prop_door_frost / prop_stairs
- UI 2：ui_panel_frame / ui_crystal_corner（app_mark 已由 SVG 程序生成）
- 屏幕 1：screen_loading
- 概念图 1：concept_main_screen（仅设计检查，非运行依赖）
- 普通怪物及 Boss 的独立行走、攻击帧：目前仍采用其立绘配合程序运动。

## 兜底策略

- 未生成的角色/怪物/Boss 使用 `src/game/render/textures.ts` 中的程序化占位图（按颜色与形状区分，可辨识）。
- 文字、血条、冷却圈、稀有度框、危险范围均由代码/图形绘制，不烘焙进图片。
- 待生成资源接入方式：生成 → 抠图（透明资源）→ `scripts/normalize.py` 归一化 → 放入 `public/assets/<路径>` → 在 `src/game/render/assets.ts` 的 `GENERATED_ASSETS` 登记。
