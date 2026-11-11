// Phaser 主场景 —— 纵向剖开塔体、多层并行战斗、镜头滚动、点击投放。
import Phaser from 'phaser';
import type { UnitState } from '../core/types';
import { store } from '../../platform/store';
import { registerPlaceholderTextures } from './textures';
import { GENERATED_ASSETS } from './assets';
import { regionOfFloor, REGION_NAMES, MONSTERS } from '../data/monsters';
import { HEROES } from '../data/heroes';
import { BALANCE, isGateFloor } from '../data/economy';

const FLOOR_H = 120;
const GROUND_OFFSET = 22;
const NORMAL_DISPLAY_H = 56;
const BOSS_DISPLAY_H = 104;
const MIN_BATTLE_WIDTH = 760;
const MANUAL_CAMERA_HOLD_MS = 5000;
const WALK_STEP_DISTANCE = 18;
const WALK_CONTACT_FRACTION = 0.6;
const WALK_STOP_DELAY = 0.12;
const ATTACK_POSE_SECONDS = 0.18;
const REGION_FLOORS = 100;
const OVERSCAN_FLOORS = 2;

const REGION_BG: Record<number, number> = {
  1: 0x24313b,
  2: 0x2c1f1a,
  3: 0x1f2b38,
};
const REGION_TEXTURE: Record<number, string> = {
  1: 'bg_tower_ruins',
  2: 'bg_tower_forge',
  3: 'bg_tower_frost',
};

function floorTopY(floorId: number): number {
  // 塔底固定为 0，解锁更高楼层时不挪动现有战场。
  return -floorId * FLOOR_H;
}

export class GameScene extends Phaser.Scene {
  private topFloor = 1;
  private worldW = 1000;
  private unitSprites = new Map<number, UnitView>();
  private prevX = new Map<number, number>();
  private floorArt!: Phaser.GameObjects.Graphics;
  private floorLabels: Phaser.GameObjects.Text[] = [];
  private regionLabels: Phaser.GameObjects.Text[] = [];
  private backdrops: RegionBackdrop[] = [];
  private renderedBottom = 0;
  private renderedTop = 0;
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private downScrollX = 0;
  private downScrollY = 0;
  private dragging = false;
  private followAfter = 0;
  private selectedFloorMark: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super('game');
  }

  preload() {
    for (const [id, path] of Object.entries(GENERATED_ASSETS)) {
      this.load.image(id, path);
    }
  }

  create() {
    registerPlaceholderTextures(this);
    this.worldW = Math.max(MIN_BATTLE_WIDTH, this.scale.width);
    this.floorArt = this.add.graphics().setDepth(-5);
    this.selectedFloorMark = this.add.graphics().setDepth(20);
    this.updateTowerBounds();
    this.scrollToFloor(store.state.selectedFloor ?? 1);
    this.updateTower();
    this.setupInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeBattlefield, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeBattlefield, this);
    });
  }

  private updateTower() {
    const camera = this.cameras.main;
    const viewLeft = camera.scrollX + (camera.width - camera.displayWidth) / 2;
    const viewTop = camera.scrollY + (camera.height - camera.displayHeight) / 2;
    const labelX = Math.max(34, viewLeft + 9 / camera.zoomX);
    const regionX = Math.min(this.worldW - 28, viewLeft + camera.displayWidth - 9 / camera.zoomX);
    const bottom = Math.max(1, Math.floor(-(viewTop + camera.displayHeight) / FLOOR_H) + 1 - OVERSCAN_FLOORS);
    const top = Math.min(this.topFloor, Math.ceil(-viewTop / FLOOR_H) + OVERSCAN_FLOORS);
    if (top === this.renderedTop && bottom === this.renderedBottom) {
      for (const label of this.floorLabels) label.setX(labelX);
      for (const label of this.regionLabels) label.setX(regionX);
      return;
    }
    this.renderedBottom = bottom;
    this.renderedTop = top;

    const g = this.floorArt.clear();
    let regionLabelsUsed = 0;
    for (let f = bottom; f <= top; f++) {
      const y = floorTopY(f) + FLOOR_H - GROUND_OFFSET;
      const region = regionOfFloor(f);
      const gate = isGateFloor(f);
      const stone = region === 1 ? 0x526675 : region === 2 ? 0x6a5040 : 0x4a6a80;
      g.fillStyle(stone, 1);
      g.fillRect(0, y, this.worldW, GROUND_OFFSET);
      g.fillStyle(0x17212b, 0.6);
      g.fillRect(0, y, this.worldW, 2);
      // 右端楼梯与左端门洞
      g.fillStyle(0x9aa7b0, 0.45);
      g.fillRect(this.worldW - 24, y - FLOOR_H + GROUND_OFFSET, 16, FLOOR_H - GROUND_OFFSET * 2);
      if (gate) {
        g.fillStyle(0xd9ad64, 0.8);
        g.fillRect(12, y - FLOOR_H + GROUND_OFFSET + 12, 16, FLOOR_H - GROUND_OFFSET * 2 - 24);
      } else {
        g.fillStyle(0x9aa7b0, 0.3);
        g.fillRect(12, y - FLOOR_H + GROUND_OFFSET + 18, 14, FLOOR_H - GROUND_OFFSET - 36);
      }

      const index = f - bottom;
      const label = this.floorLabels[index] ?? this.add.text(0, 0, '', {
        fontFamily: 'sans-serif', fontSize: '11px', stroke: '#17212b', strokeThickness: 2,
      }).setDepth(-4);
      this.floorLabels[index] = label;
      label.setPosition(labelX, floorTopY(f) + 6).setText(gate ? `◆ ${f} 层` : `${f} 层`)
        .setColor(gate ? '#d9ad64' : '#8a97a3').setVisible(true);
      if ((f - 1) % REGION_FLOORS === 0) {
        const name = this.regionLabels[regionLabelsUsed] ?? this.add.text(0, 0, '', {
          fontFamily: 'sans-serif', fontSize: '13px', color: '#e9e1cf', fontStyle: 'bold',
        }).setDepth(-4).setAlpha(0.55).setOrigin(1, 0);
        this.regionLabels[regionLabelsUsed++] = name;
        name.setPosition(regionX, floorTopY(f) + 4).setText(REGION_NAMES[region]).setVisible(true);
      }
    }
    for (const label of this.floorLabels.slice(top - bottom + 1)) label.setVisible(false);
    for (const label of this.regionLabels.slice(regionLabelsUsed)) label.setVisible(false);
    this.updateBackdrops(bottom, top);
  }

  private resizeBattlefield(gameSize: Phaser.Structs.Size) {
    const width = Math.max(MIN_BATTLE_WIDTH, gameSize.width);
    if (width !== this.worldW) {
      const ratio = width / this.worldW;
      this.worldW = width;
      for (const view of this.unitSprites.values()) view.container.x *= ratio;
      this.renderedTop = 0;
    }
    this.updateTowerBounds();
    this.updateTower();
  }

  private updateTowerBounds() {
    const state = store.state;
    this.topFloor = state.mode === 'classic' ? BALANCE.floorsTotal : state.maxFloorUnlocked;
    const camera = this.cameras.main;
    const topY = floorTopY(this.topFloor);
    camera.setBounds(0, topY, this.worldW, -topY);
    this.scrollCamera(camera.scrollX, camera.scrollY);
  }

  private updateBackdrops(bottom: number, top: number) {
    let layersUsed = 0;
    for (let floor = bottom; floor <= top;) {
      const region = regionOfFloor(floor);
      const regionTop = Math.ceil(floor / REGION_FLOORS) * REGION_FLOORS;
      const last = Math.min(top, regionTop);
      const y = floorTopY(last);
      const height = (last - floor + 1) * FLOOR_H;
      const key = REGION_TEXTURE[region];
      const hasTile = this.textures.exists(key);
      const layer = this.backdrops[layersUsed] ?? {
        key: '',
        tile: null,
        shade: this.add.rectangle(0, 0, 1, 1).setOrigin(0, 0).setDepth(-9),
      };
      this.backdrops[layersUsed++] = layer;
      if (hasTile) {
        if (!layer.tile) layer.tile = this.add.tileSprite(0, y, this.worldW, height, key).setOrigin(0, 0).setDepth(-10);
        else if (layer.key !== key) layer.tile.setTexture(key);
        if (layer.key !== key) {
          const tileScale = (FLOOR_H * 2) / this.textures.get(key).getSourceImage().height;
          layer.tile.setTileScale(tileScale, tileScale);
          layer.key = key;
        }
        layer.tile.setPosition(0, y).setSize(this.worldW, height).setVisible(true);
        layer.tile.tilePositionY = (y - floorTopY(regionTop)) / layer.tile.tileScaleY;
      } else {
        layer.tile?.setVisible(false);
      }
      layer.shade.setFillStyle(hasTile ? 0x0a1116 : REGION_BG[region], hasTile ? 0.42 : 1)
        .setPosition(0, y).setSize(this.worldW, height).setVisible(true);
      floor = last + 1;
    }
    for (const layer of this.backdrops.slice(layersUsed)) {
      layer.shade.setVisible(false);
      layer.tile?.setVisible(false);
    }
  }

  private scrollCamera(x: number, y: number) {
    const camera = this.cameras.main;
    camera.setScroll(camera.clampX(x), camera.clampY(y));
  }

  private scrollToFloor(floor: number) {
    const camera = this.cameras.main;
    const y = floorTopY(Phaser.Math.Clamp(floor, 1, this.topFloor)) + (FLOOR_H - camera.height) / 2;
    this.scrollCamera(camera.scrollX, y);
  }

  focusFloor(floor: number) {
    if (!this.floorArt) return;
    this.updateTowerBounds();
    this.scrollToFloor(floor);
    this.followAfter = performance.now() + MANUAL_CAMERA_HOLD_MS;
  }

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downX = p.x;
      this.downY = p.y;
      this.downTime = performance.now();
      this.downScrollX = this.cameras.main.scrollX;
      this.downScrollY = this.cameras.main.scrollY;
      this.dragging = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const dy = p.y - this.downY;
      const dx = p.x - this.downX;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) this.dragging = true;
      if (this.dragging) {
        const camera = this.cameras.main;
        this.scrollCamera(this.downScrollX - dx / camera.zoomX, this.downScrollY - dy / camera.zoomY);
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const moved = Math.hypot(p.x - this.downX, p.y - this.downY);
      const dt = performance.now() - this.downTime;
      if (!this.dragging && moved < 12 && dt < 400) this.handleTap(p);
      this.endDrag();
    });
    this.input.on('pointerupoutside', () => this.endDrag());
    this.input.on('wheel', (_p: unknown, _o: unknown[], dx: number, dy: number) => {
      const camera = this.cameras.main;
      this.scrollCamera(camera.scrollX + dx / camera.zoomX, camera.scrollY + dy / camera.zoomY);
      this.followAfter = performance.now() + MANUAL_CAMERA_HOLD_MS;
    });
  }

  private endDrag() {
    if (this.dragging) this.followAfter = performance.now() + MANUAL_CAMERA_HOLD_MS;
    this.dragging = false;
  }

  private handleTap(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const floorId = -Math.floor(wp.y / FLOOR_H);
    if (floorId < 1 || floorId > this.topFloor) return;
    store.dispatch('summon', floorId);
    store.dispatch('selectFloor', floorId);
  }

  update(_time: number, delta: number) {
    if (!store.ready) return;
    const dt = Math.min(0.1, delta / 1000);
    this.prevX.clear();
    for (const u of store.state.units) this.prevX.set(u.id, u.x);
    store.step(dt);
    store.notifyEvents();
    const state = store.state;
    const topFloor = state.mode === 'classic' ? BALANCE.floorsTotal : state.maxFloorUnlocked;
    if (this.topFloor !== topFloor) this.updateTowerBounds();
    this.autoFollowFront();
    this.updateTower();
    this.syncUnits();
    this.updateSelectedFloorMark();
  }

  private syncUnits() {
    const state = store.state;
    const seen = new Set<number>();
    const now = performance.now() / 1000;

    for (const u of state.units) {
      if (u.floorId < this.renderedBottom || u.floorId > this.renderedTop) continue;
      seen.add(u.id);
      let view = this.unitSprites.get(u.id);
      if (view?.unit !== u) {
        view?.container.destroy(true);
        view = this.createUnitView(u);
        this.unitSprites.set(u.id, view);
      }
      this.updateUnitView(view, u, now);
    }
    for (const [id, view] of this.unitSprites) {
      if (!seen.has(id)) {
        view.container.destroy(true);
        this.unitSprites.delete(id);
      }
    }
  }

  private createUnitView(u: UnitState): UnitView {
    const isBoss = u.kind === 'boss';
    const displayH = isBoss ? BOSS_DISPLAY_H : NORMAL_DISPLAY_H;
    const idleTexture = this.textures.exists(u.templateId) ? u.templateId : 'unit_summon_squire';
    const walkA = `${u.templateId}_walk_a`;
    const walkB = `${u.templateId}_walk_b`;
    const passA = `${u.templateId}_walk_pass_a`;
    const passB = `${u.templateId}_walk_pass_b`;
    const attack = `${u.templateId}_attack`;

    const container = this.add.container((u.x / 1000) * this.worldW, floorTopY(u.floorId) + FLOOR_H - GROUND_OFFSET);
    container.setDepth(10 + (u.team === 'ally' ? 5 : 0));

    const body = this.add.image(0, 0, idleTexture).setOrigin(0.5, 1);
    const hpW = isBoss ? 78 : u.kind === 'hero' ? 38 : 28;
    const hpBg = this.add.rectangle(0, -displayH - 8, hpW, 5, 0x000000, 0.6).setOrigin(0.5, 0.5);
    const hpFill = this.add.rectangle(-hpW / 2, -displayH - 8, hpW, 5, 0x54cfb0, 1).setOrigin(0, 0.5);
    const shieldFill = this.add.rectangle(-hpW / 2, -displayH - 11, hpW, 3, 0x81c9ea, 1).setOrigin(0, 0.5);
    shieldFill.setVisible(false);
    const cdCircle = this.add.graphics();

    container.add([body, hpBg, hpFill, shieldFill, cdCircle]);

    let label: Phaser.GameObjects.Text | null = null;
    if (u.kind === 'hero') {
      label = this.add.text(0, -displayH - 16, '', {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#e9e1cf',
      }).setOrigin(0.5, 0.5);
      container.add(label);
    }
    return {
      container, body, hpFill, shieldFill, hpW, cdCircle, label, displayH,
      unit: u,
      idleTexture,
      walkTextures: this.textures.exists(walkA) && this.textures.exists(walkB)
        ? [
            walkA, this.textures.exists(passA) ? passA : idleTexture,
            walkB, this.textures.exists(passB) ? passB : idleTexture,
          ]
        : null,
      attackTexture: this.textures.exists(attack) ? attack : null,
      attackUntil: -1, prevAttackCd: u.attackCooldown, prevHp: u.hp, hitUntil: -1,
      lastMoveAt: -1, walkDistance: 0,
      prevFloor: u.floorId,
    };
  }

  private updateUnitView(view: UnitView, u: UnitState, now: number) {
    const y = floorTopY(u.floorId) + FLOOR_H - GROUND_OFFSET;
    const targetX = (u.x / 1000) * this.worldW;
    // 楼层切换时直接定位，不平滑滑动，避免“从右滑到左”的错觉
    const changedFloor = u.floorId !== view.prevFloor;
    const displayX = changedFloor ? targetX : Phaser.Math.Linear(view.container.x, targetX, 0.35);
    view.prevFloor = u.floorId;

    // 飞行单位悬浮偏移
    const flying = (u.kind === 'enemy' || u.kind === 'boss') && MONSTERS[u.templateId]?.flying === true;
    const floatOffset = flying ? -14 - Math.sin(now * 2.5 + u.id) * 3 : 0;

    // 固定步长之间沿用最近的移动状态，到达等待位后恢复站姿。
    const prevX = this.prevX.get(u.id) ?? u.x;
    const forwardDistance = (u.x - prevX) * u.facing;
    if (changedFloor || u.phase !== 'moving' || u.moveSpeed <= 0) {
      view.lastMoveAt = -1;
    } else if (forwardDistance > 0.01) {
      if (view.lastMoveAt < 0) view.walkDistance = 0;
      // 分离碰撞产生的瞬间位移最多计入两次模拟步的行走距离。
      view.walkDistance += Math.min(forwardDistance, u.moveSpeed * 0.1);
      view.lastMoveAt = now;
    } else if (now - view.lastMoveAt >= WALK_STOP_DELAY) {
      view.lastMoveAt = -1;
    }
    const isMoving = view.lastMoveAt >= 0;

    if (changedFloor || u.phase === 'dead') {
      view.attackUntil = -1;
    } else if (u.attackCooldown > view.prevAttackCd + 0.02) {
      view.attackUntil = now + ATTACK_POSE_SECONDS;
    }
    view.prevAttackCd = u.attackCooldown;

    if (u.hp < view.prevHp - 0.001) view.hitUntil = now + 0.15;
    view.prevHp = u.hp;

    let bodyY = 0;
    let bodyRot = 0;
    let sx = 1;
    let sy = 1;
    let lungeX = 0;
    const attacking = view.attackUntil > now;
    let texture = view.idleTexture;

    if (attacking && view.attackTexture) {
      texture = view.attackTexture;
    } else if (attacking) {
      const t = 1 - (view.attackUntil - now) / ATTACK_POSE_SECONDS;
      const k = Math.sin(t * Math.PI); // 0→1→0 的冲击
      lungeX = u.facing * 7 * k;
      bodyRot = u.facing * 0.14 * k;
      sx = 1 + 0.08 * k;
      sy = 1 - 0.08 * k;
    } else if (isMoving && view.walkTextures) {
      const step = view.walkDistance / WALK_STEP_DISTANCE;
      const foot = Math.floor(step) % 2;
      const passing = step % 1 >= WALK_CONTACT_FRACTION;
      const frame = foot * 2 + Number(passing);
      texture = view.walkTextures[frame];
    } else if (isMoving) {
      const step = now * 12 + u.id * 1.7;
      bodyY = -Math.abs(Math.sin(step)) * 3;
      bodyRot = Math.sin(step) * 0.05;
      sx = 1 + Math.sin(step) * 0.05;
      sy = 1 - Math.sin(step) * 0.05;
    } else if (!view.walkTextures && !view.attackTexture) {
      bodyY = Math.sin(now * 3 + u.id) * 1.5;
    }

    view.container.setPosition(displayX, y + floatOffset);
    if (view.body.texture.key !== texture) view.body.setTexture(texture);
    view.body.setFlipX(u.facing < 0 && (view.walkTextures !== null || view.attackTexture !== null));
    // 动作帧与待机图分辨率不同，按同一显示高度绘制。
    const scale = view.displayH / view.body.height;
    view.body.setPosition(lungeX, bodyY);
    view.body.setRotation(bodyRot);
    view.body.setScale(scale * sx, scale * sy);
    view.container.setAlpha(u.phase === 'dead' ? 0.3 : 1);

    const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 0;
    const w = Math.max(0, view.hpW * ratio);
    view.hpFill.setSize(w, 5);
    view.hpFill.setPosition(-view.hpW / 2, -view.displayH - 8);
    view.hpFill.setFillStyle(ratio > 0.5 ? 0x54cfb0 : ratio > 0.25 ? 0xe0b53a : 0xd9675d, 1);

    if (u.shield > 0) {
      view.shieldFill.setVisible(true);
      view.shieldFill.setSize(Math.min(view.hpW, view.hpW * (u.shield / u.maxHp)), 3);
      view.shieldFill.setPosition(-view.hpW / 2, -view.displayH - 11);
    } else {
      view.shieldFill.setVisible(false);
    }

    view.cdCircle.clear();
    if ((u.kind === 'hero' || u.kind === 'boss') && u.skillCooldown > 0) {
      const cfg = u.kind === 'hero' ? HEROES[u.templateId] : null;
      const total = cfg?.skillCooldown ?? 8;
      const frac = 1 - Phaser.Math.Clamp(u.skillCooldown / total, 0, 1);
      const cx = view.displayH * 0.15;
      const cy = -view.displayH * 0.1;
      view.cdCircle.fillStyle(0x000000, 0.5);
      view.cdCircle.fillCircle(cx, cy, 9);
      view.cdCircle.lineStyle(3, 0xd9ad64, 1);
      view.cdCircle.beginPath();
      view.cdCircle.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      view.cdCircle.strokePath();
    }

    if (view.hitUntil > now) view.body.setTint(0xffffff);
    else if (u.slowUntil > store.state.time) view.body.setTint(0x81c9ea);
    else if (u.burnUntil > store.state.time) view.body.setTint(0xd9675d);
    else view.body.clearTint();

    if (view.label) view.label.setText(`${HEROES[u.templateId]?.shortName ?? ''} Lv${u.heroLevel}`);
  }

  private updateSelectedFloorMark() {
    const f = store.state.selectedFloor;
    const g = this.selectedFloorMark?.clear();
    if (!g || !f || f < this.renderedBottom || f > this.renderedTop) return;
    g.lineStyle(2, 0x54cfb0, 0.8);
    g.strokeRect(4, floorTopY(f) + 2, this.worldW - 8, FLOOR_H - 4);
  }

  private autoFollowFront() {
    if (this.dragging || performance.now() < this.followAfter) return;
    let front: UnitState | undefined;
    for (const u of store.state.units) {
      if (u.team === 'ally' && u.phase !== 'dead' && (!front || u.floorId > front.floorId
        || (u.floorId === front.floorId && u.x > front.x))) front = u;
    }
    if (!front) return;
    const camera = this.cameras.main;
    const frontY = floorTopY(front.floorId) + FLOOR_H / 2;
    const cameraMiddle = camera.scrollY + camera.height / 2;
    const targetY = camera.clampY(frontY - camera.height / 2);
    const distance = Math.abs(frontY - cameraMiddle);
    let scrollY = camera.scrollY;
    if (distance > camera.displayHeight * 2) scrollY = targetY;
    else if (distance > Math.max(FLOOR_H / 2, camera.displayHeight / 2 - FLOOR_H)) {
      scrollY = Phaser.Math.Linear(scrollY, targetY, 0.05);
    }
    const targetX = camera.clampX(front.x * this.worldW / 1000 - camera.width / 2 + camera.displayWidth * 0.1);
    this.scrollCamera(Phaser.Math.Linear(camera.scrollX, targetX, 0.08), scrollY);
  }
}

interface RegionBackdrop {
  key: string;
  tile: Phaser.GameObjects.TileSprite | null;
  shade: Phaser.GameObjects.Rectangle;
}

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  shieldFill: Phaser.GameObjects.Rectangle;
  hpW: number;
  cdCircle: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text | null;
  displayH: number;
  unit: UnitState;
  idleTexture: string;
  walkTextures: string[] | null;
  attackTexture: string | null;
  // 动画状态
  attackUntil: number;
  prevAttackCd: number;
  prevHp: number;
  hitUntil: number;
  lastMoveAt: number;
  walkDistance: number;
  prevFloor: number;
}
