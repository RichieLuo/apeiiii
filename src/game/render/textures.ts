// 程序化占位纹理 —— 在真实美术接入前保证游戏可运行、可辨识。
// 文字、血条、冷却圈、稀有度框、危险范围由代码/图形绘制，不烘焙进图片。
import Phaser from 'phaser';
import { HEROES } from '../data/heroes';
import { MONSTERS } from '../data/monsters';

export function registerPlaceholderTextures(scene: Phaser.Scene) {
  // 英雄（面向右）
  for (const [id, cfg] of Object.entries(HEROES)) {
    if (scene.textures.exists(id)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawHero(g, cfg.color);
    g.generateTexture(id, 128, 128);
    g.destroy();
  }
  // 普通勇者
  if (!scene.textures.exists('unit_summon_squire')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawSquire(g);
    g.generateTexture('unit_summon_squire', 128, 128);
    g.destroy();
  }
  // 炮台
  if (!scene.textures.exists('unit_copper_turret')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawTurret(g);
    g.generateTexture('unit_copper_turret', 128, 128);
    g.destroy();
  }
  // 怪物（面向左）
  for (const [id, cfg] of Object.entries(MONSTERS)) {
    if (scene.textures.exists(id)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawMonster(g, id, cfg.color);
    const size = cfg.kind === 'boss' ? 256 : 128;
    g.generateTexture(id, size, size);
    g.destroy();
  }
}

function drawHero(g: Phaser.GameObjects.Graphics, color: string) {
  const c = Phaser.Display.Color.HexStringToColor(color);
  const colorNum = c.color;
  const dark = Phaser.Display.Color.GetColor(Math.max(0, c.red - 40), Math.max(0, c.green - 40), Math.max(0, c.blue - 40));
  // 身体（圆角矩形）
  g.fillStyle(colorNum, 1);
  g.fillRoundedRect(40, 52, 52, 46, 10);
  // 头部
  g.fillStyle(colorNum, 1);
  g.fillCircle(66, 40, 22);
  // 头部高光（肤色）
  g.fillStyle(0xf0d9b5, 1);
  g.fillCircle(66, 44, 15);
  // 武器（短剑）
  g.fillStyle(0xd9ad64, 1);
  g.fillRect(92, 54, 6, 30);
  g.fillStyle(0xc0c8cc, 1);
  g.fillTriangle(96, 46, 104, 50, 96, 58);
  // 轮廓
  g.lineStyle(3, dark, 1);
  g.strokeCircle(66, 40, 22);
  g.strokeRoundedRect(40, 52, 52, 46, 10);
}

function drawSquire(g: Phaser.GameObjects.Graphics) {
  const color = 0x8a94a8;
  g.fillStyle(color, 1);
  g.fillRoundedRect(46, 58, 40, 40, 8);
  g.fillStyle(color, 1);
  g.fillCircle(66, 46, 18);
  g.fillStyle(0xf0d9b5, 1);
  g.fillCircle(66, 49, 12);
  g.fillStyle(0xd9ad64, 1);
  g.fillRect(88, 58, 5, 26);
  g.lineStyle(3, 0x4a4f58, 1);
  g.strokeCircle(66, 46, 18);
  g.strokeRoundedRect(46, 58, 40, 40, 8);
}

function drawTurret(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x9a7a3a, 1);
  g.fillRect(40, 78, 48, 14); // 底座
  g.fillStyle(0x6a5a2a, 1);
  g.fillRect(52, 62, 24, 18); // 主体
  g.fillStyle(0x8a6a2a, 1);
  g.fillRect(66, 54, 26, 12); // 炮管
  g.fillStyle(0x54cfb0, 1);
  g.fillCircle(58, 72, 5); // 能源灯
  g.lineStyle(2, 0x4a3a1a, 1);
  g.strokeRect(40, 78, 48, 14);
  g.strokeRect(52, 62, 24, 18);
  g.strokeRect(66, 54, 26, 12);
}

function drawMonster(g: Phaser.GameObjects.Graphics, id: string, colorHex: string) {
  const c = Phaser.Display.Color.HexStringToColor(colorHex);
  const color = Phaser.Display.Color.GetColor(c.red, c.green, c.blue);
  g.fillStyle(color, 1);
  const boss = MONSTERS[id].kind === 'boss';
  const m = boss ? 2 : 1; // boss 放大系数

  switch (id) {
    case 'enemy_moss_blob': {
      g.fillStyle(0x6a9a5a, 1);
      g.fillEllipse(64, 88, 72 * m, 48 * m);
      g.fillStyle(0x4a7a3a, 1);
      g.fillEllipse(64, 92, 54 * m, 28 * m);
      g.fillStyle(0xffd94a, 1);
      g.fillCircle(44, 78, 5 * m);
      g.fillStyle(0x3a5a2a, 1);
      g.fillTriangle(60, 60, 68, 44, 76, 60);
      break;
    }
    case 'enemy_cave_bat': {
      g.fillStyle(0x7a6a9a, 1);
      g.fillEllipse(64, 66, 40 * m, 28 * m);
      g.fillStyle(0x9a8ab0, 1);
      g.fillTriangle(30, 60, 58, 70, 30, 78);
      g.fillTriangle(98, 60, 70, 70, 98, 78);
      g.fillStyle(0xffd94a, 1);
      g.fillCircle(48, 62, 3 * m);
      break;
    }
    case 'enemy_iron_beetle': {
      g.fillStyle(0x5a6a7a, 1);
      g.fillEllipse(64, 84, 76 * m, 44 * m);
      g.fillStyle(0x3a4a5a, 1);
      g.fillEllipse(64, 88, 56 * m, 26 * m);
      g.fillStyle(0x2a3a4a, 1);
      g.fillRect(36, 66, 8 * m, 14 * m);
      break;
    }
    case 'enemy_bone_soldier': {
      g.fillStyle(0xc9c2b0, 1);
      g.fillCircle(64, 46, 16 * m);
      g.fillRect(48, 62, 32 * m, 30 * m);
      g.fillStyle(0x5a6a7a, 1);
      g.fillRect(82, 62, 14 * m, 22 * m);
      g.fillStyle(0x54cfb0, 1);
      g.fillCircle(58, 44, 3 * m);
      g.fillCircle(70, 44, 3 * m);
      break;
    }
    case 'enemy_miner_golem': {
      g.fillStyle(0x7a7a7a, 1);
      g.fillRect(40, 52, 48 * m, 40 * m);
      g.fillStyle(0x5a5a5a, 1);
      g.fillRect(44, 62, 16 * m, 24 * m);
      g.fillStyle(0x54cfb0, 1);
      g.fillRect(56, 70, 12 * m, 12 * m);
      break;
    }
    case 'enemy_fire_lizard': {
      g.fillStyle(0xa84a30, 1);
      g.fillEllipse(64, 80, 64 * m, 34 * m);
      g.fillStyle(0xd96a3a, 1);
      g.fillTriangle(40, 64, 56, 66, 48, 74);
      g.fillStyle(0xff8a3a, 1);
      g.fillTriangle(90, 66, 100, 60, 96, 70);
      break;
    }
    case 'enemy_ash_sprite': {
      g.fillStyle(0x8a6a5a, 1);
      g.fillEllipse(64, 66, 34 * m, 40 * m);
      g.fillStyle(0xffa04a, 1);
      g.fillCircle(64, 70, 10 * m);
      break;
    }
    case 'enemy_charred_guard': {
      g.fillStyle(0x5a4a44, 1);
      g.fillRect(40, 48, 48 * m, 42 * m);
      g.fillStyle(0x3a2a24, 1);
      g.fillRect(36, 56, 16 * m, 28 * m);
      g.fillStyle(0xd96a3a, 1);
      g.fillRect(52, 66, 10 * m, 4 * m);
      break;
    }
    case 'enemy_frost_wolf': {
      g.fillStyle(0x7a8a9a, 1);
      g.fillEllipse(62, 82, 66 * m, 36 * m);
      g.fillStyle(0x9ab0c9, 1);
      g.fillTriangle(40, 66, 52, 72, 46, 78);
      g.fillStyle(0x4a5a6a, 1);
      g.fillCircle(46, 72, 4 * m);
      break;
    }
    case 'enemy_snow_wisp': {
      g.fillStyle(0x9ab0c9, 1);
      g.fillTriangle(40, 48, 88, 48, 64, 96);
      g.fillStyle(0x4a6a8a, 1);
      g.fillCircle(64, 62, 8 * m);
      break;
    }
    case 'enemy_ice_sentinel': {
      g.fillStyle(0x4a7a8a, 1);
      g.fillRect(40, 48, 46 * m, 44 * m);
      g.fillStyle(0x81c9ea, 1);
      g.fillRect(40, 50, 46 * m, 12 * m);
      g.fillStyle(0x2a4a5a, 1);
      g.fillRect(46, 58, 12 * m, 26 * m);
      break;
    }
    case 'enemy_crystal_spider': {
      g.fillStyle(0x5a6a8a, 1);
      g.fillEllipse(64, 84, 40 * m, 28 * m);
      g.fillStyle(0x8a6ab0, 1);
      g.fillEllipse(64, 76, 20 * m, 18 * m);
      g.fillStyle(0x2a3a5a, 1);
      g.fillRect(44, 94, 6 * m, 14 * m);
      g.fillRect(56, 98, 6 * m, 14 * m);
      g.fillRect(72, 94, 6 * m, 14 * m);
      g.fillRect(84, 98, 6 * m, 14 * m);
      break;
    }
    case 'boss_gate_colossus': {
      g.fillStyle(0x6a7a7a, 1);
      g.fillRect(36, 40, 92 * m, 70 * m);
      g.fillStyle(0x4a5a5a, 1);
      g.fillRect(28, 40, 28 * m, 56 * m);
      g.fillRect(96, 40, 28 * m, 56 * m);
      g.fillStyle(0x54cfb0, 1);
      g.fillCircle(80, 78, 10 * m);
      g.fillStyle(0xd9ad64, 1);
      g.fillCircle(52, 56, 4 * m);
      g.fillCircle(68, 56, 4 * m);
      break;
    }
    case 'boss_furnace_golem': {
      g.fillStyle(0x3a2a24, 1);
      g.fillRect(36, 42, 88 * m, 68 * m);
      g.fillStyle(0xd96a3a, 1);
      g.fillCircle(72, 78, 14 * m);
      g.fillStyle(0xffa04a, 1);
      g.fillCircle(72, 78, 8 * m);
      g.fillStyle(0x5a3a2a, 1);
      g.fillRect(44, 28, 12 * m, 16 * m);
      g.fillRect(96, 28, 12 * m, 16 * m);
      break;
    }
    case 'boss_prism_warden': {
      g.fillStyle(0x6a5a8a, 1);
      g.fillEllipse(64, 66, 60 * m, 52 * m);
      g.fillStyle(0x8a6ab0, 1);
      g.fillTriangle(64, 22, 44, 52, 84, 52);
      g.fillTriangle(64, 22, 30, 66, 46, 90);
      g.fillTriangle(64, 22, 98, 66, 82, 90);
      g.fillStyle(0xffd94a, 1);
      g.fillCircle(64, 66, 10 * m);
      break;
    }
    default: {
      g.fillEllipse(64, 80, 56, 40);
      break;
    }
  }
}
