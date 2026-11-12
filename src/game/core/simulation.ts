// 模拟内核 —— 固定 20Hz 逻辑步长、种子随机、命令式状态。
// 逻辑 Tick 先收集行动，再统一结算伤害/治疗/死亡/掉落/首通/转移。
import type { GameMode, GameState, UnitState, FloorState, DomainEvent } from './types';
import { Random } from './rng';
import {
  heroStatsOf,
  squireStatsOf,
  monsterStatsOf,
  makeUnit,
  makeFloor,
  pickMonsterForFloor,
  bossForFloor,
  compactClearedFloors,
  isFloorCleared,
  isFloorUnlocked,
  normalizeGameState,
  normalizeHeroOrder,
} from './state';
import { HEROES, HERO_ORDER, MELEE_RANGE } from '../data/heroes';
import { MONSTERS, regionOfFloor } from '../data/monsters';
import { BALANCE, damageFormula, heroUpgradeCost, isGateFloor, monsterGoldAt, squireUpgradeCost } from '../data/economy';
import { sumBoardGems } from '../data/gems';
import { QUESTS, ACHIEVEMENTS } from '../data/quests';

export interface CommandResult {
  ok: boolean;
  reason?: string;
  events: DomainEvent[];
}

const STAIR_X = 920; // 右侧楼梯（盟友上行）
const LEFT_X = 80; // 左侧楼梯（盟友下行）
const ALLY_SPAWN_X = 60;
const ENEMY_SPAWN_X = 940;
const ENEMY_WAIT_X = 132; // 敌人留出左侧入口，避免全队阵亡后堵住复活点
const FRONTLINE_X = 620; // 盟友在未清楼层无敌人时的中场等待位（不越过怪物刷新点）
const WIDTH = BALANCE.floorLogicalWidth;
const EDGE_X = 10;
const TEAM_SPACING = 1.2;
const HERO_DEPLOY_INTERVAL = 1.05;
const FORMATION_LANES = 3;

interface PendingAttack {
  attacker: UnitState;
  target: UnitState;
  dmg: number;
  crit: boolean;
  ranged: boolean;
  applyBurn?: { dps: number; duration: number };
  applySlow?: boolean;
}

export class Simulation {
  state: GameState;
  rng: Random;
  private accumulator = 0;
  private heroRanks: Map<string, number>;
  events: DomainEvent[] = [];

  constructor(state: GameState) {
    this.state = normalizeGameState(state);
    this.rng = Random.fromState(state.rng);
    this.heroRanks = new Map(this.state.heroOrder.map((id, rank) => [id, rank]));
    this.assignFormationLanes();
    this.maybeUnlockNextSegment();
  }

  // —— 主循环 ——
  step(dt: number) {
    this.accumulator += dt;
    let guard = 0;
    while (this.accumulator >= BALANCE.tick && guard < 60) {
      this.accumulator -= BALANCE.tick;
      this.tick();
      guard++;
    }
    if (guard >= 60) this.accumulator = 0;
    this.state.rng = this.rng.getState();
  }

  private emit(e: DomainEvent) {
    this.events.push(e);
  }

  private tick() {
    const s = this.state;
    const dt = BALANCE.tick;
    s.time += dt;

    this.deployNextHero();
    this.regenSummon(dt);
    this.autoSummon();
    this.tickActiveSkills(dt);
    this.checkChallengeActivations();
    this.spawnWaves();
    this.goldFloorLoop();
    this.collectActions(dt);
    this.resolveDeaths();
    this.checkWaveProgress();
    this.maybeUnlockNextSegment();
    this.resolveTransitions();
    this.tickStronghold(dt);
    this.tickBuffTimers();
    this.pruneDead();
  }

  // —— 英雄入场与复活 ——
  private nextReadyHero() {
    const s = this.state;
    const units = new Map(s.units.filter((u) => u.kind === 'hero').map((u) => [u.templateId, u]));
    const start = s.lastHeroDeployed === null ? 0 : (this.heroRanks.get(s.lastHeroDeployed) ?? -1) + 1;
    for (let i = 0; i < s.heroOrder.length; i++) {
      const id = s.heroOrder[(start + i) % s.heroOrder.length];
      const hero = s.heroes[id];
      if (!hero.owned || !hero.enabled) continue;
      const unit = units.get(id);
      if (!unit || (unit.phase === 'dead' && unit.respawnAt >= 0 && s.time >= unit.respawnAt)) {
        return { id, hero, unit };
      }
    }
    return null;
  }

  private deployNextHero() {
    const s = this.state;
    if (s.time < s.heroDeployAt) return;
    const ready = this.nextReadyHero();
    if (!ready) return;
    const { id, hero } = ready;
    const floorId = this.heroSpawnFloor();
    const stats = heroStatsOf(s, id);
    const lane = HEROES[id].melee ? this.entryMeleeLane(floorId, ALLY_SPAWN_X, 'hero', stats.range) : undefined;
    if (!this.hasEntrySpace(floorId, ALLY_SPAWN_X, 'hero', 'ally', stats.range, lane)) return;

    const u = ready.unit ?? makeUnit(s, 'hero', id, floorId, 'ally', ALLY_SPAWN_X, stats);
    u.heroLevel = hero.level;
    u.heroStar = hero.star;
    if (ready.unit) {
      u.maxHp = stats.hp;
      u.hp = stats.hp;
      u.shield = 0;
      u.attack = stats.atk;
      u.defense = stats.def;
      u.attackInterval = stats.attackInterval;
      u.range = stats.range;
      u.critChance = stats.critChance;
      u.critMult = stats.critMult;
      u.floorId = floorId;
      u.x = ALLY_SPAWN_X;
      u.phase = 'idle';
      u.facing = 1;
      u.respawnAt = -1;
      u.targetId = null;
    } else {
      s.units.push(u);
    }
    u.combatLane = lane;
    s.heroDeployAt = s.time + HERO_DEPLOY_INTERVAL;
    s.lastHeroDeployed = id;
    this.emit({ type: ready.unit ? 'hero_respawn' : 'hero_deployed', at: s.time, heroId: id, floorId });
  }

  private heroSpawnFloor(): number {
    const s = this.state;
    if (s.mode === 'classic') return BALANCE.heroRespawnFloor;
    if (s.goldFloor !== null && isFloorCleared(s, s.goldFloor)) return s.goldFloor;
    return s.maxFloorUnlocked - BALANCE.floorsPerGate + 1;
  }

  // —— 召唤库存 ——
  private regenSummon(dt: number) {
    const s = this.state;
    s.summon.inventory = Math.min(s.summon.inventoryMax, s.summon.inventory + s.summon.regenPerSec * dt);
    s.summon.spawnCooldown = Math.max(0, s.summon.spawnCooldown - dt);
  }

  private aliveSquires(): number {
    return this.state.units.filter((u) => u.kind === 'squire' && u.phase !== 'dead').length;
  }

  canSpawnSquire(floorId: number): { ok: boolean; reason?: string } {
    const s = this.state;
    if (!isFloorUnlocked(s, floorId)) return { ok: false, reason: '楼层未解锁' };
    if (s.summon.inventory < 1) return { ok: false, reason: '库存不足' };
    if (this.aliveSquires() >= s.summon.aliveMax) return { ok: false, reason: '场上勇者已达上限' };
    if (s.summon.spawnCooldown > 0) return { ok: false, reason: '生成冷却中' };
    const lane = this.entryMeleeLane(floorId, ALLY_SPAWN_X, 'squire', MELEE_RANGE);
    if (!this.hasEntrySpace(floorId, ALLY_SPAWN_X, 'squire', 'ally', MELEE_RANGE, lane)) {
      return { ok: false, reason: '入口拥挤，等待前队推进' };
    }
    return { ok: true };
  }

  spawnSquire(floorId: number): CommandResult {
    const check = this.canSpawnSquire(floorId);
    if (!check.ok) return { ok: false, reason: check.reason, events: [] };
    const s = this.state;
    const stats = squireStatsOf(s);
    const unit = makeUnit(s, 'squire', 'unit_summon_squire', floorId, 'ally', ALLY_SPAWN_X, stats);
    unit.combatLane = this.entryMeleeLane(floorId, ALLY_SPAWN_X, 'squire', stats.range);
    s.units.push(unit);
    s.summon.inventory -= 1;
    s.summon.spawnCooldown = BALANCE.squireSpawnInterval;
    this.activateFloor(floorId);
    this.emit({ type: 'squire_summoned', at: s.time, floorId });
    this.bumpMetric('summon_count', 1);
    return { ok: true, events: [...this.events] };
  }

  private autoSummon() {
    const s = this.state;
    if (!s.summon.autoEnabled || s.summon.autoTargetFloor == null) return;
    if (s.summon.spawnCooldown > 0) return;
    if (s.summon.autoTargetFloor === this.heroSpawnFloor() && this.nextReadyHero()) {
      let nearest: UnitState | undefined;
      for (const u of this.alliesOnFloor(s.summon.autoTargetFloor)) {
        if (!nearest || Math.abs(u.x - ALLY_SPAWN_X) < Math.abs(nearest.x - ALLY_SPAWN_X)) nearest = u;
      }
      if (nearest?.kind === 'squire') return;
    }
    this.spawnSquire(s.summon.autoTargetFloor);
  }

  // —— 主动技能 ——
  private tickActiveSkills(dt: number) {
    const s = this.state;
    s.activeSkills.battleCryCooldown = Math.max(0, s.activeSkills.battleCryCooldown - dt);
    s.activeSkills.lifeEchoCooldown = Math.max(0, s.activeSkills.lifeEchoCooldown - dt);
    s.activeSkills.crystalRainCooldown = Math.max(0, s.activeSkills.crystalRainCooldown - dt);
    s.activeSkills.rapidAdvanceCooldown = Math.max(0, s.activeSkills.rapidAdvanceCooldown - dt);
    if (s.activeSkills.rapidAdvanceUntil <= s.time) s.activeSkills.rapidAdvanceUntil = 0;
  }

  // —— 楼层挑战 ——
  ensureFloor(floorId: number) {
    const s = this.state;
    return s.floors[floorId] ??= makeFloor(floorId, isFloorUnlocked(s, floorId), isFloorCleared(s, floorId));
  }

  private activateFloor(floorId: number) {
    const s = this.state;
    const floor = s.floors[floorId];
    if (!floor || !floor.unlocked || floor.challenge !== 'inactive' || floor.cleared) return;
    floor.challenge = 'active';
    floor.currentWave = 0;
    floor.nextWaveAt = s.time + 0.3;

    if (isGateFloor(floorId)) {
      floor.waves = [
        { index: 0, monsterId: GATE_GUARD[regionOfFloor(floorId)], total: BALANCE.gateWaveGuards, remainingSpawns: BALANCE.gateWaveGuards, nextSpawnAt: s.time + 0.5, alive: 0, done: false },
        { index: 1, monsterId: bossForFloor(floorId), total: 1, remainingSpawns: 1, nextSpawnAt: 0, alive: 0, done: false },
      ];
    } else {
      floor.waves = [];
      for (let w = 0; w < BALANCE.wavesPerFloor; w++) {
        floor.waves.push({
          index: w,
          monsterId: pickMonsterForFloor(this.rng, floorId),
          total: BALANCE.enemiesPerWave,
          remainingSpawns: BALANCE.enemiesPerWave,
          nextSpawnAt: s.time + 0.5,
          alive: 0,
          done: false,
        });
      }
    }
  }

  private checkChallengeActivations() {
    const s = this.state;
    const occupiedFloors = new Set<number>();
    for (const u of s.units) {
      if (u.team === 'ally' && u.phase !== 'dead') occupiedFloors.add(u.floorId);
    }
    for (const floorId of [...occupiedFloors].sort((a, b) => a - b)) this.activateFloor(floorId);
  }

  // —— 波次刷新 ——
  private spawnWaves() {
    const s = this.state;
    for (const f of Object.values(s.floors)) {
      if (f.challenge !== 'active') continue;
      if (f.currentWave < 0 || f.currentWave >= f.waves.length) continue;
      const wave = f.waves[f.currentWave];
      if (wave.done) continue;
      if (wave.remainingSpawns > 0 && s.time >= wave.nextSpawnAt) {
        if (!this.spawnEnemy(f.floorId, wave.monsterId)) continue;
        wave.remainingSpawns--;
        wave.alive++;
        wave.nextSpawnAt = s.time + BALANCE.waveSpawnInterval;
      }
    }
  }

  private spawnEnemy(floorId: number, monsterId: string) {
    const s = this.state;
    const stats = monsterStatsOf(monsterId, floorId);
    const kind = MONSTERS[monsterId].kind === 'boss' ? 'boss' : 'enemy';
    if (!this.hasEntrySpace(floorId, ENEMY_SPAWN_X, kind, 'enemy', stats.range)) return false;
    const unit = makeUnit(s, kind, monsterId, floorId, 'enemy', ENEMY_SPAWN_X, stats);
    const cfg = MONSTERS[monsterId];
    if (cfg.boss) unit.skillCooldown = cfg.boss.skillInterval;
    s.units.push(unit);
    return true;
  }

  // —— 刷金循环 ——
  private goldFloorLoop() {
    const s = this.state;
    if (s.goldFloor == null) return;
    if (!isFloorCleared(s, s.goldFloor)) return;
    const floor = this.ensureFloor(s.goldFloor);
    const hasEnemy = s.units.some((u) => u.team === 'enemy' && u.floorId === s.goldFloor && u.phase !== 'dead');
    if (hasEnemy) return;
    if (floor.challenge === 'active') {
      const waveDone = floor.waves.every((w) => w.done);
      if (!waveDone) return;
    }
    floor.challenge = 'active';
    floor.currentWave = 0;
    floor.waves = [{
      index: 0,
      monsterId: pickMonsterForFloor(this.rng, s.goldFloor),
      total: BALANCE.enemiesPerWave,
      remainingSpawns: BALANCE.enemiesPerWave,
      nextSpawnAt: s.time + 0.5,
      alive: 0,
      done: false,
    }];
  }

  // —— 单位行动 ——
  private unitsOnFloor(floorId: number, alive = true): UnitState[] {
    return this.state.units.filter((u) => u.floorId === floorId && (!alive || u.phase !== 'dead'));
  }

  private enemiesOnFloor(floorId: number): UnitState[] {
    return this.unitsOnFloor(floorId).filter((u) => u.team === 'enemy');
  }

  private alliesOnFloor(floorId: number): UnitState[] {
    return this.unitsOnFloor(floorId).filter((u) => u.team === 'ally');
  }

  private nearestTarget(unit: UnitState, candidates: UnitState[]): UnitState | null {
    let best: UnitState | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c.x - unit.x);
      if (d < bestDist || (d === bestDist && best && c.id < best.id)) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  private collectActions(dt: number) {
    const s = this.state;
    const attacks: PendingAttack[] = [];
    const heals: { target: UnitState; amount: number }[] = [];
    const newUnits: UnitState[] = [];
    this.assignFormationLanes();
    const marchTargets = this.heroMarchTargets();
    const yielding = new Set<number>();

    for (const u of s.units) {
      if (u.phase === 'dead') continue;
      const attackRate = u.slowUntil > s.time ? 1 - u.slowFactor : 1;
      u.attackCooldown = Math.max(0, u.attackCooldown - dt * attackRate);
      u.skillCooldown = Math.max(0, u.skillCooldown - dt);

      const enemies = this.enemiesOnFloor(u.floorId);
      const allies = this.alliesOnFloor(u.floorId);

      // 灼烧
      if (u.burnUntil > s.time && u.burnDps > 0) {
        attacks.push({ attacker: u, target: u, dmg: Math.max(1, Math.round(u.burnDps * dt)), crit: false, ranged: true });
      }

      // 目标选择与攻击
      const targetCandidates = u.team === 'ally' ? enemies : allies;
      const target = this.nearestTarget(u, targetCandidates);

      if (target) {
        u.targetId = target.id;
        const marchTarget = marchTargets.get(u.id);
        const yieldTo = this.meleeClearance(u, target, allies);
        if (yieldTo !== null && this.moveTowardPoint(u, yieldTo, dt, u.kind === 'turret' ? 40 : u.moveSpeed)) {
          yielding.add(u.id);
        } else if (Math.abs(target.x - u.x) <= u.range) {
          if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;
          u.phase = 'attacking';
        } else if (marchTarget !== undefined) {
          this.moveTowardPoint(u, marchTarget, dt, u.moveSpeed);
        } else {
          u.phase = 'moving';
          this.moveToward(u, target, dt);
        }
      } else {
        u.targetId = null;
        this.moveWithoutTarget(u, dt, marchTargets.get(u.id));
      }
    }

    this.resolveCollisions(marchTargets);
    for (const u of s.units) {
      if (u.phase === 'dead' || u.skillCooldown > 0) continue;
      if (u.kind === 'hero') this.heroSkill(u, this.enemiesOnFloor(u.floorId), this.alliesOnFloor(u.floorId), attacks, heals, newUnits);
      if (u.kind === 'boss') this.bossSkill(u, this.alliesOnFloor(u.floorId), attacks);
    }
    // 队列拉开以后再判定普攻范围，后排接近敌人后才开始攻击。
    for (const u of s.units) {
      if (u.phase === 'dead' || u.targetId === null || yielding.has(u.id)) continue;
      const opponents = u.team === 'ally' ? this.enemiesOnFloor(u.floorId) : this.alliesOnFloor(u.floorId);
      const target = this.nearestTarget(u, opponents);
      if (!target || Math.abs(target.x - u.x) > u.range) {
        u.phase = 'moving';
        continue;
      }
      u.targetId = target.id;
      if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;
      u.phase = 'attacking';
      if (u.attackCooldown > 0) continue;

      const crit = this.rng.chance(u.critChance);
      const boost = u.atkBoostUntil > s.time ? 1 + u.atkBoostFactor : 1;
      const dmg = damageFormula(u.attack * boost, target.defense, 1, crit ? u.critMult : 1);
      const isBurner = u.team === 'enemy' && MONSTERS[u.templateId]?.behavior === 'burn';
      const appliesSlow = u.team === 'enemy' && MONSTERS[u.templateId]?.behavior === 'slow';
      attacks.push({
        attacker: u,
        target,
        dmg,
        crit,
        ranged: !this.isMelee(u),
        applyBurn: isBurner ? { dps: Math.max(1, Math.round(u.attack * 0.2)), duration: 3 } : undefined,
        applySlow: appliesSlow,
      });
      u.attackCooldown = u.attackInterval;
    }

    // 统一结算攻击
    for (const a of attacks) {
      if (a.target.phase === 'dead') continue;
      let dmg = a.dmg;
      if (a.attacker !== a.target && a.target.shield > 0) {
        const absorbed = Math.min(a.target.shield, dmg);
        a.target.shield -= absorbed;
        dmg -= absorbed;
      }
      a.target.hp -= dmg;
      if (a.applyBurn && a.attacker !== a.target) {
        a.target.burnUntil = s.time + a.applyBurn.duration;
        a.target.burnDps = a.applyBurn.dps;
      }
      if (a.applySlow && a.attacker !== a.target) {
        a.target.slowFactor = Math.max(a.target.slowFactor, 0.25);
        a.target.slowUntil = Math.max(a.target.slowUntil, s.time + 3);
      }
      if (a.target.hp <= 0) {
        a.target.hp = 0;
        a.target.phase = 'dead';
        this.onUnitKilled(a.target);
      }
      if (a.attacker !== a.target && dmg > 0) {
        this.emit({ type: 'hit', at: s.time, targetId: a.target.id, dmg, crit: a.crit });
      }
    }

    for (const h of heals) {
      if (h.target.phase === 'dead') continue;
      h.target.hp = Math.min(h.target.maxHp, h.target.hp + h.amount);
      this.emit({ type: 'heal', at: s.time, targetId: h.target.id, amount: h.amount });
    }

    for (const nu of newUnits) s.units.push(nu);
  }

  private bossSkill(u: UnitState, allies: UnitState[], attacks: PendingAttack[]) {
    const cfg = MONSTERS[u.templateId];
    if (!cfg.boss || u.skillCooldown > 0) return;
    const s = this.state;
    const skill = cfg.boss.skill;
    // 半血后提高攻击频率
    let interval = cfg.boss.skillInterval;
    if (skill === 'furnace' && u.hp < u.maxHp / 2) interval = Math.max(3, interval * 0.6);

    switch (skill) {
      case 'colossus': {
        // 护盾 + 扇形重击（同层全部友军 150% 攻击）
        u.shield = Math.max(u.shield, Math.round(u.maxHp * 0.2));
        for (const a of allies) {
          if (Math.abs(a.x - u.x) <= 320) {
            attacks.push({ attacker: u, target: a, dmg: damageFormula(u.attack, a.defense, 1.5), crit: false, ranged: false });
          }
        }
        this.emit({ type: 'boss_skill', at: s.time, templateId: u.templateId, skill });
        break;
      }
      case 'furnace': {
        // 同层火焰冲击
        for (const a of allies) {
          attacks.push({ attacker: u, target: a, dmg: damageFormula(u.attack, a.defense, 0.8), crit: false, ranged: true });
        }
        this.emit({ type: 'boss_skill', at: s.time, templateId: u.templateId, skill });
        break;
      }
      case 'prism': {
        // 晶盾 + 晶弹齐射（就近 3 名友军）
        u.shield = Math.max(u.shield, Math.round(u.maxHp * 0.2));
        const sorted = [...allies].sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x));
        for (const a of sorted.slice(0, 3)) {
          attacks.push({ attacker: u, target: a, dmg: damageFormula(u.attack, a.defense, 1.0), crit: false, ranged: true });
        }
        this.emit({ type: 'boss_skill', at: s.time, templateId: u.templateId, skill });
        break;
      }
    }
    u.skillCooldown = interval;
  }

  // 单位被击杀：英雄进入复活，勇者/敌人标记死亡（掉落由 resolveDeaths 去重处理）
  private onUnitKilled(u: UnitState) {
    const s = this.state;
    if (u.kind === 'hero') {
      u.respawnAt = s.time + BALANCE.heroRespawnDelay;
      u.shield = 0;
      this.emit({ type: 'hero_died', at: s.time, heroId: u.templateId });
    }
  }

  private isMelee(u: UnitState): boolean {
    if (u.kind === 'hero') return HEROES[u.templateId]?.melee ?? true;
    if (u.kind === 'enemy' || u.kind === 'boss') return MONSTERS[u.templateId]?.melee ?? true;
    return u.kind !== 'turret';
  }

  // 近战和远程都分三路，避免远程单列占满整层、把增援堵在楼梯下。
  // 战后保留通道，刷新或队友阵亡不重新洗牌。
  formationLane(u: UnitState): number | null {
    return u.team === 'ally' && (u.kind === 'hero' || u.kind === 'squire') && u.phase !== 'dead'
      ? u.combatLane ?? null : null;
  }

  meleeLane(u: UnitState): number | null {
    return this.isMelee(u) ? this.formationLane(u) : null;
  }

  private assignFormationLanes() {
    const groups = new Map<number, UnitState[]>();
    for (const u of this.state.units) {
      if (u.team !== 'ally' || (u.kind !== 'hero' && u.kind !== 'squire') || u.phase === 'dead') continue;
      const group = groups.get(u.floorId) ?? [];
      group.push(u);
      groups.set(u.floorId, group);
    }
    for (const group of groups.values()) {
      const counts = new Array<number>(FORMATION_LANES).fill(0);
      for (const u of group) {
        const lane = u.combatLane;
        if (lane !== undefined && Number.isInteger(lane) && lane >= 0 && lane < FORMATION_LANES) counts[lane]++;
        else u.combatLane = undefined;
      }
      // 先让最靠前的单位留在中路，后排依次补到空闲通道。
      group.sort((a, b) => b.x - a.x || a.id - b.id);
      for (const u of group) {
        if (u.combatLane !== undefined) continue;
        const lane = counts.indexOf(Math.min(...counts));
        u.combatLane = lane;
        counts[lane]++;
      }
    }
  }

  private separateMeleeLanes(a: UnitState, b: UnitState): boolean {
    const lane = this.meleeLane(a);
    return lane !== null && this.meleeLane(b) !== null && lane !== this.meleeLane(b);
  }

  private separateFormationLanes(a: UnitState, b: UnitState): boolean {
    const lane = this.formationLane(a);
    const otherLane = this.formationLane(b);
    return lane !== null && otherLane !== null && lane !== otherLane;
  }

  private meleeClearance(u: UnitState, target: UnitState, allies: UnitState[]): number | null {
    if (u.team !== 'ally' || this.isMelee(u)) return null;
    const dir = Math.sign(target.x - u.x);
    if (dir === 0) return null;
    let destination = u.x;
    for (const ally of allies) {
      if (!this.isMelee(ally) || this.separateFormationLanes(u, ally)) continue;
      const gap = this.teamGap(u.kind, ally.kind);
      const relativeX = dir * (u.x - ally.x);
      if (relativeX < -gap || relativeX > gap * 2) continue;
      // 贴得过近的远程让出一排，使近战能走到敌人的攻击距离内。
      const meleePosition = Math.max(dir * ally.x, dir * target.x - ally.range);
      const rearPosition = (meleePosition - gap) * dir;
      if (dir * (rearPosition - destination) < 0) destination = rearPosition;
    }
    const bounded = Math.max(EDGE_X, Math.min(WIDTH - EDGE_X, destination));
    return Math.abs(bounded - u.x) > 0.01 ? bounded : null;
  }

  private moveToward(u: UnitState, target: UnitState, dt: number) {
    const dir = target.x > u.x ? 1 : -1;
    const speed = this.currentMoveSpeed(u);
    u.x += dir * speed * dt;
    u.x = Math.max(10, Math.min(WIDTH - 10, u.x));
    u.facing = dir;
  }

  private allyDestination(u: UnitState): number | null {
    const s = this.state;
    const cleared = isFloorCleared(s, u.floorId);
    if (u.kind !== 'hero' && u.kind !== 'squire') return null;
    if (!cleared) return Math.max(u.x, FRONTLINE_X);
    if (u.kind === 'squire') return STAIR_X;
    if (s.goldFloor != null) {
      if (u.floorId === s.goldFloor) return null;
      return u.floorId < s.goldFloor ? STAIR_X : LEFT_X;
    }
    return this.canAscend(u.floorId) ? STAIR_X : null;
  }

  private heroRank(u: UnitState): number {
    return this.heroRanks.get(u.templateId) ?? Infinity;
  }

  private heroMarchTargets(): Map<number, number> {
    const live = this.state.units.filter((u) => u.phase !== 'dead');
    const groups = new Map<number, UnitState[]>();
    for (const u of live) {
      if (u.kind !== 'hero') continue;
      const group = groups.get(u.floorId) ?? [];
      group.push(u);
      groups.set(u.floorId, group);
    }
    const targets = new Map<number, number>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => this.heroRank(a) - this.heroRank(b));
      const leader = group[0];
      const destination = this.allyDestination(leader);
      const positions = group.map((u) => u.x);
      const opponents = this.enemiesOnFloor(leader.floorId);
      let dir = destination === LEFT_X ? -1 : 1;
      if (opponents.length > 0) {
        const engaged = this.alliesOnFloor(leader.floorId).some((ally) => opponents.some((opponent) =>
          Math.abs(ally.x - opponent.x) <= Math.max(ally.range, opponent.range)));
        if (engaged) continue;
        // 接战前可重新列队。敌人在队伍中间时，各自选择目标。
        const left = Math.min(...positions);
        const right = Math.max(...positions);
        if (opponents.every((u) => u.x > right)) dir = 1;
        else if (opponents.every((u) => u.x < left)) dir = -1;
        else continue;
      } else if (destination === null) {
        targets.set(leader.id, Math.max(...positions));
      }
      for (let i = 1; i < group.length; i++) {
        const follower = group[i];
        // 近战只跟随本通道前队；不同通道并肩行进，不再战后瞬间收成单列。
        const ahead = group.slice(0, i).reverse().find((u) => !this.separateMeleeLanes(u, follower));
        if (!ahead) continue;
        const gap = this.teamGap(ahead.kind, follower.kind);
        targets.set(follower.id, Math.max(EDGE_X, Math.min(WIDTH - EDGE_X, ahead.x - dir * gap)));
      }
    }
    return targets;
  }

  private moveWithoutTarget(u: UnitState, dt: number, marchTarget?: number) {
    const targetX = u.team === 'enemy' ? ENEMY_WAIT_X : marchTarget ?? this.allyDestination(u);
    this.moveTowardPoint(u, targetX ?? u.x, dt, u.moveSpeed);
  }

  private moveTowardPoint(u: UnitState, targetX: number, dt: number, moveSpeed: number): boolean {
    const dx = targetX - u.x;
    const speed = this.currentMoveSpeed(u, moveSpeed);
    if (Math.abs(dx) > 0.01 && speed > 0) {
      u.facing = Math.sign(dx);
      u.x += u.facing * Math.min(Math.abs(dx), speed * dt);
      u.phase = 'moving';
      return true;
    }
    u.phase = 'idle';
    return false;
  }

  private currentMoveSpeed(u: UnitState, baseSpeed = u.moveSpeed): number {
    const rapidAdvance = u.kind === 'hero' && u.team === 'ally'
      && this.state.activeSkills.rapidAdvanceUntil > this.state.time;
    const boost = rapidAdvance ? 1 + BALANCE.skillRapidAdvance.moveBoost : 1;
    const slow = u.slowUntil > this.state.time ? 1 - u.slowFactor : 1;
    return baseSpeed * boost * slow;
  }

  private canAscend(floorId: number): boolean {
    return isFloorUnlocked(this.state, floorId + 1);
  }

  private heroSkill(
    u: UnitState,
    enemies: UnitState[],
    allies: UnitState[],
    attacks: PendingAttack[],
    heals: { target: UnitState; amount: number }[],
    newUnits: UnitState[],
  ) {
    const cfg = HEROES[u.templateId];
    if (!cfg || u.skillCooldown > 0) return;
    const s = this.state;
    const nearby = enemies.filter((target) => Math.abs(target.x - u.x) <= u.range)
      .sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x) || a.id - b.id);

    switch (cfg.skill) {
      case 'shield': {
        u.shield = Math.max(u.shield, Math.round(u.maxHp * 0.25));
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'shield' });
        break;
      }
      case 'arrow': {
        const t = nearby[0];
        if (!t) return;
        for (let i = 0; i < 2; i++) attacks.push({ attacker: u, target: t, dmg: damageFormula(u.attack, t.defense, 0.8), crit: false, ranged: true });
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'arrow' });
        break;
      }
      case 'fireball': {
        if (nearby.length === 0) return;
        for (const t of nearby.slice(0, 3)) attacks.push({
          attacker: u, target: t, dmg: damageFormula(u.attack, t.defense, 1.4), crit: false, ranged: !cfg.melee,
        });
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'fireball' });
        break;
      }
      case 'heal': {
        const wounded = allies.filter((a) => a.hp < a.maxHp);
        if (wounded.length > 0) {
          const lowest = [...wounded].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          heals.push({ target: lowest, amount: Math.round(u.attack * 1.6) });
          u.skillCooldown = cfg.skillCooldown;
          this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'heal' });
        }
        break;
      }
      case 'assassinate': {
        const t = nearby[0];
        if (!t) return;
        attacks.push({ attacker: u, target: t, dmg: damageFormula(u.attack, t.defense, 2.0), crit: true, ranged: false });
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'assassinate' });
        break;
      }
      case 'turret': {
        const existing = s.units.some((n) => n.kind === 'turret' && n.floorId === u.floorId && n.phase !== 'dead' && n.expireAt > s.time)
          || newUnits.some((n) => n.kind === 'turret' && n.floorId === u.floorId);
        if (existing) return;
        const stats = { hp: 60, atk: Math.round(u.attack * 0.7), def: 0, attackInterval: 1, range: 260, moveSpeed: 0, critChance: 0, critMult: 1.5 };
        const gap = this.teamGap('hero', 'turret');
        const x = [u.x - u.facing * gap, u.x + u.facing * gap].find((position) =>
          position >= ALLY_SPAWN_X + gap && position <= STAIR_X - 4 - gap
          && enemies.some((target) => Math.abs(target.x - position) <= stats.range)
          && this.hasEntrySpace(u.floorId, position, 'turret', 'ally', stats.range));
        if (x === undefined) return;
        const turret = makeUnit(s, 'turret', 'unit_copper_turret', u.floorId, 'ally', x, stats);
        turret.expireAt = s.time + 6;
        newUnits.push(turret);
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'turret' });
        break;
      }
      case 'ice': {
        const t = nearby[0];
        if (!t) return;
        attacks.push({ attacker: u, target: t, dmg: damageFormula(u.attack, t.defense, 1.2), crit: false, ranged: true });
        t.slowUntil = s.time + 4;
        t.slowFactor = 0.25;
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'ice' });
        break;
      }
      case 'banner': {
        for (const a of allies) {
          // 战意鼓舞等更强增益持续期间，旗帜不能覆盖其倍率或缩短持续时间。
          if (a.atkBoostUntil > s.time && a.atkBoostFactor > 0.15) continue;
          a.atkBoostUntil = s.time + 5;
          a.atkBoostFactor = 0.15;
        }
        u.skillCooldown = cfg.skillCooldown;
        this.emit({ type: 'hero_skill', at: s.time, heroId: u.templateId, skill: 'banner' });
        break;
      }
    }
  }

  // —— 死亡结算（掉落去重） ——
  private resolveDeaths() {
    const s = this.state;
    const dead = new Map<number, UnitState>();
    for (const u of s.units) {
      if (u.team === 'enemy' && u.phase === 'dead') dead.set(u.id, u);
    }
    for (const u of dead.values()) this.handleEnemyDeath(u);
  }

  private handleEnemyDeath(u: UnitState) {
    const s = this.state;
    const floor = s.floors[u.floorId];
    const cfg = MONSTERS[u.templateId];
    const isBoss = cfg?.kind === 'boss';
    const baseGold = isBoss && cfg.boss ? monsterGoldAt(u.floorId) * cfg.boss.goldMult : monsterGoldAt(u.floorId);
    const goldTotals = sumBoardGems(s.gemBoard);
    const gold = safeInt(Math.round(baseGold * (1 + goldTotals.goldPct)));

    s.resources.gold = safeInt(s.resources.gold + gold);
    this.bumpMetric('gold_earned', gold);
    this.bumpMetric('kill_count', 1);
    if (isBoss) this.bumpMetric('boss_kill_count', 1);

    if (this.rng.chance(BALANCE.gemDropChance)) this.grantRandomGem();

    if (floor && floor.challenge === 'active' && floor.currentWave >= 0 && floor.currentWave < floor.waves.length) {
      const wave = floor.waves[floor.currentWave];
      if (wave.alive > 0) wave.alive--;
    }
    this.emit({ type: 'enemy_killed', at: s.time, templateId: u.templateId, floorId: u.floorId, gold, boss: isBoss });
    const idx = s.units.indexOf(u);
    if (idx >= 0) s.units.splice(idx, 1);
  }

  private grantRandomGem() {
    const s = this.state;
    const types = ['attack', 'health', 'defense', 'haste', 'critical', 'gold'] as const;
    const type = types[this.rng.int(0, types.length - 1)];
    s.gems.push({ id: `gem_${Math.floor(s.time)}_${this.rng.int(0, 1e9)}`, type, level: 1, locked: false });
    this.emit({ type: 'gem_drop', at: s.time, gemType: type });
  }

  // —— 波次推进与首通 ——
  private checkWaveProgress() {
    const s = this.state;
    for (const floor of Object.values(s.floors)) {
      if (floor.challenge !== 'active') continue;
      if (floor.currentWave < 0) continue;
      const wave = floor.waves[floor.currentWave];
      if (!wave) continue;
      if (wave.remainingSpawns === 0 && wave.alive === 0 && !wave.done) {
        wave.done = true;
        if (floor.currentWave >= floor.waves.length - 1) this.completeFloor(floor);
        else {
          floor.currentWave++;
          const nextWave = floor.waves[floor.currentWave];
          nextWave.nextSpawnAt = s.time + BALANCE.waveGap;
        }
      }
    }
  }

  private completeFloor(floor: FloorState) {
    const s = this.state;
    const firstClear = !floor.cleared;
    floor.challenge = 'cleared';
    floor.cleared = true;
    if (floor.floorId > s.highestClearedFloor) s.highestClearedFloor = floor.floorId;

    if (firstClear) {
      if (isGateFloor(floor.floorId)) {
        if (!floor.firstClearRewarded) {
          floor.firstClearRewarded = true;
          this.grantRandomGem();
          this.grantEquipment(floor.floorId);
          this.emit({ type: 'gate_cleared', at: s.time, floorId: floor.floorId });
        }
      } else if (!floor.firstClearRewarded) {
        floor.firstClearRewarded = true;
        const bonus = Math.round(monsterGoldAt(floor.floorId) * 3);
        s.resources.gold = safeInt(s.resources.gold + bonus);
        this.bumpMetric('gold_earned', bonus);
      }
      s.resources.crystal = safeInt(s.resources.crystal + (isGateFloor(floor.floorId) ? 20 : 2));
      if (isGateFloor(floor.floorId)) {
        // 关口首通额外给 1 张招募券
        s.resources.recruitTickets += 1;
      }
      this.bumpMetric('max_floor', floor.floorId);
      this.emit({ type: 'floor_cleared', at: s.time, floorId: floor.floorId, firstClear });
    }
    if (s.mode === 'endless' && !firstClear && floor.floorId !== s.goldFloor) compactClearedFloors(s);
  }

  private grantEquipment(floorId: number) {
    const s = this.state;
    const slot = (['weapon', 'armor', 'trinket'] as const)[this.rng.int(0, 2)];
    const rarity = this.rng.chance(0.6) ? 'common' : this.rng.chance(0.7) ? 'rare' : 'epic';
    const atk = slot === 'weapon' ? (rarity === 'common' ? 5 : rarity === 'rare' ? 12 : 22) : 0;
    const hp = slot === 'armor' ? (rarity === 'common' ? 40 : rarity === 'rare' ? 100 : 180) : slot === 'trinket' ? (rarity === 'common' ? 20 : rarity === 'rare' ? 50 : 90) : 0;
    const def = slot === 'armor' ? (rarity === 'common' ? 2 : rarity === 'rare' ? 5 : 9) : slot === 'trinket' ? (rarity === 'rare' ? 1 : 0) : 0;
    s.equipment.push({
      id: `eq_${Math.floor(s.time)}_${floorId}_${this.rng.int(0, 1e6)}`,
      templateId: `generated_${slot}`,
      rarity,
      slot,
      level: 1,
      locked: false,
      equippedBy: null,
      atkBonus: atk,
      hpBonus: hp,
      defBonus: def,
    });
    this.emit({ type: 'equipment_drop', at: s.time, rarity, slot });
  }

  // —— 跨层转移 ——
  private resolveTransitions() {
    const s = this.state;
    for (const u of s.units) {
      if (u.team !== 'ally' || u.phase === 'dead') continue;
      if (u.kind === 'turret') continue;
      // 已抵达楼梯的单位先通过，不能在此等待被自己队列挡住的召唤顺序前队。
      const hasEnemy = this.enemiesOnFloor(u.floorId).length > 0;
      if (hasEnemy) continue;
      if (!isFloorCleared(s, u.floorId)) continue;

      const destination = this.allyDestination(u);
      if (destination === STAIR_X && u.x >= STAIR_X - 2) {
        if (this.canAscend(u.floorId)) {
          const lane = this.isMelee(u) ? this.entryMeleeLane(u.floorId + 1, ALLY_SPAWN_X, u.kind, u.range) : undefined;
          if (!this.hasEntrySpace(u.floorId + 1, ALLY_SPAWN_X, u.kind, u.team, u.range, lane)) continue;
          u.floorId += 1;
          u.x = ALLY_SPAWN_X;
          u.combatLane = lane;
        } else if (u.kind === 'squire') {
          // 勇者到达已清空但无法上行的顶层入口时退役，释放存活上限，避免永久堵塞
          u.phase = 'dead';
          this.emit({ type: 'squire_retire', at: s.time, floorId: u.floorId });
        }
      } else if (destination === LEFT_X && u.x <= LEFT_X + 2) {
        const lane = this.isMelee(u) ? this.entryMeleeLane(u.floorId - 1, STAIR_X - 4, u.kind, u.range) : undefined;
        if (isFloorUnlocked(s, u.floorId - 1) && this.hasEntrySpace(u.floorId - 1, STAIR_X - 4, u.kind, u.team, u.range, lane)) {
          u.floorId -= 1;
          u.x = STAIR_X - 4;
          u.combatLane = lane;
        }
      }
    }
  }

  // —— 碰撞分离（刚体概念：同层单位不堆叠） ——
  private unitRadius(kind: UnitState['kind']): number {
    switch (kind) {
      case 'boss': return 40;
      case 'hero': return 22;
      case 'squire': return 18;
      case 'turret': return 16;
      default: return 20; // enemy
    }
  }

  private teamGap(a: UnitState['kind'], b: UnitState['kind']): number {
    return (this.unitRadius(a) + this.unitRadius(b)) * TEAM_SPACING;
  }

  private entryMeleeLane(floorId: number, x: number, kind: UnitState['kind'], range: number): number | undefined {
    // 无敌人的入口仍依次通过；接敌堵门时，可使用空闲的近战通道。
    if (this.enemiesOnFloor(floorId).length === 0) return undefined;
    const counts = new Array<number>(FORMATION_LANES).fill(0);
    for (const u of this.alliesOnFloor(floorId)) {
      const lane = this.formationLane(u);
      if (lane !== null) counts[lane]++;
    }
    const lanes = counts.map((_, lane) => lane).sort((a, b) => counts[a] - counts[b] || a - b);
    return lanes.find((lane) => this.hasEntrySpace(floorId, x, kind, 'ally', range, lane)) ?? lanes[0];
  }

  private hasEntrySpace(floorId: number, x: number, kind: UnitState['kind'], team: UnitState['team'], range: number, lane?: number): boolean {
    return !this.state.units.some((u) => {
      if (u.floorId !== floorId || u.phase === 'dead') return false;
      if (lane !== undefined && u.team === team && this.formationLane(u) !== null && this.formationLane(u) !== lane) return false;
      // 近战从空闲通道进入后会借道越过远程，不能被入口处的远程队尾挡在楼下。
      if (lane !== undefined && team === 'ally' && u.team === team && !this.isMelee(u)) return false;
      const gap = u.team === team ? this.teamGap(kind, u.kind)
        : Math.min((this.unitRadius(kind) + this.unitRadius(u.kind)) * 0.9, range, u.range);
      return Math.abs(u.x - x) < gap - 0.01;
    });
  }

  private canPassAlly(mover: UnitState, other: UnitState, dir: number, fighting: boolean, marchTargets: Map<number, number>): boolean {
    if (mover.phase !== 'moving' || mover.facing !== dir) return false;
    // 反向通行，或近战借道穿过交战的远程和炮台。
    if ((other.phase === 'moving' && other.facing === -dir)
      || (fighting && mover.team === 'ally' && this.isMelee(mover) && !this.isMelee(other))
      || (other.phase === 'attacking' && mover.range < other.range)
      || other.kind === 'turret') return true;
    if ((fighting && !marchTargets.has(mover.id)) || other.phase !== 'idle' || mover.team !== 'ally') return false;
    const destination = marchTargets.get(mover.id) ?? this.allyDestination(mover);
    return destination !== null && dir * (destination - other.x) >= this.teamGap(mover.kind, other.kind) - 0.01;
  }

  private separatePair(a: UnitState, b: UnitState, cleared: boolean, fighting: boolean, marchTargets: Map<number, number>) {
    if (this.separateFormationLanes(a, b)) return;
    if (a.team !== b.team) {
      // 隔开对阵双方，间距必须仍允许最短的攻击距离。
      const sum = this.unitRadius(a.kind) + this.unitRadius(b.kind);
      const push = Math.min(sum * 0.9, a.range, b.range) - (b.x - a.x);
      if (push <= 0) return;
      const leftCanMove = Math.max(0, a.x - EDGE_X);
      const rightCanMove = Math.max(0, WIDTH - EDGE_X - b.x);
      const share = a.phase === b.phase ? 0.5 : a.phase === 'attacking' ? 0 : b.phase === 'attacking' ? 1 : 0.5;
      const leftPush = Math.min(leftCanMove, Math.max(push - rightCanMove, push * share));
      a.x -= leftPush;
      b.x += Math.min(rightCanMove, push - leftPush);
      return;
    }

    const push = this.teamGap(a.kind, b.kind) - (b.x - a.x);
    if (push <= 0 || this.canPassAlly(a, b, 1, fighting, marchTargets)
      || this.canPassAlly(b, a, -1, fighting, marchTargets)) return;

    // 同队从前线向后排开，交战中的后排也必须留出间距。
    const teamDirection = a.team === 'ally' ? 1 : -1;
    const dir = a.facing === b.facing && Math.abs(a.facing) === 1 ? a.facing : teamDirection;
    const [front, rear] = dir > 0 ? [b, a] : [a, b];
    const rearRoom = dir > 0 ? rear.x - EDGE_X : WIDTH - EDGE_X - rear.x;
    const rearPush = Math.min(push, Math.max(0, rearRoom));
    rear.x -= dir * rearPush;

    // 出生点一侧没有空间时，只在没有对手的楼层向前摊开。
    if (!fighting && rearPush < push) {
      const frontLimit = !cleared && front.team === 'ally' ? Math.max(front.x, FRONTLINE_X) : WIDTH - EDGE_X;
      const frontRoom = dir > 0 ? frontLimit - front.x : front.x - EDGE_X;
      front.x += dir * Math.min(push - rearPush, Math.max(0, frontRoom));
    }
  }

  private resolveCollisions(marchTargets: Map<number, number>) {
    const s = this.state;
    const byFloor = new Map<number, UnitState[]>();
    for (const u of s.units) {
      if (u.phase === 'dead') continue;
      let arr = byFloor.get(u.floorId);
      if (!arr) { arr = []; byFloor.set(u.floorId, arr); }
      arr.push(u);
    }
    for (const units of byFloor.values()) {
      if (units.length < 2) continue;
      // 同坐标时先来的单位靠前，避免新生成的单位插入前排。
      units.sort((a, b) => a.x - b.x || (a.team === b.team
        ? (a.team === 'ally' ? b.id - a.id : a.id - b.id)
        : a.team === 'ally' ? -1 : 1));
      const cleared = isFloorCleared(s, units[0].floorId);
      const fighting = units.some((u) => u.team !== units[0].team);
      // 错位近战可能夹在同一道的两个单位之间，不能只检查横坐标相邻者。
      // 左右各扫一遍，同时保留敌人对所有通道的阻挡。
      for (let i = 1; i < units.length; i++) {
        for (let j = i - 1; j >= 0; j--) {
          this.separatePair(units[j], units[i], cleared, fighting, marchTargets);
        }
      }
      for (let i = units.length - 1; i > 0; i--) {
        for (let j = i - 1; j >= 0; j--) {
          this.separatePair(units[j], units[i], cleared, fighting, marchTargets);
        }
      }
    }
  }

  // —— 增益计时 ——
  private tickBuffTimers() {
    const s = this.state;
    for (const u of s.units) {
      if (u.phase === 'dead') continue;
      // 护盾线性衰减（持续约 4 秒）
      if (u.shield > 0) u.shield = Math.max(0, u.shield - (u.maxHp * 0.25) / (4 / BALANCE.tick));
      if (u.slowUntil > 0 && s.time > u.slowUntil) { u.slowUntil = 0; u.slowFactor = 0; }
      if (u.atkBoostUntil > 0 && s.time > u.atkBoostUntil) { u.atkBoostUntil = 0; u.atkBoostFactor = 0; }
      if (u.burnUntil > 0 && s.time > u.burnUntil) { u.burnUntil = 0; u.burnDps = 0; }
      if (u.expireAt > 0 && s.time > u.expireAt) u.phase = 'dead';
    }
  }

  // 清理已死亡的非英雄单位
  private pruneDead() {
    const s = this.state;
    s.units = s.units.filter((u) => !(u.phase === 'dead' && u.kind !== 'hero'));
  }

  // —— 据点 ——
  private tickStronghold(dt: number) {
    const s = this.state;
    for (const site of Object.values(s.stronghold.sites)) {
      if (!site.conquered) continue;
      const capped = s.time - site.lastCollectAt > BALANCE.strongholdCapHours * 3600;
      if (!capped) site.stored += this.siteRate(site.id, site.level) * dt;
    }
  }

  private siteRate(id: string, level: number): number {
    const base = id === 'gold_mine' ? 2 : id === 'dust_workshop' ? 1 : 0.5;
    return base * level;
  }

  // —— 命令 ——
  bumpMetric(metric: string, amount: number) {
    const s = this.state;
    for (const q of Object.values(s.quests)) {
      const def = QUESTS.find((x) => x.id === q.id);
      if (def && def.metric === metric) q.progress = Math.min(def.target, q.progress + amount);
    }
    for (const a of Object.values(s.achievements)) {
      const def = ACHIEVEMENTS.find((x) => x.id === a.id);
      if (def && def.metric === metric) a.progress = Math.min(def.target, a.progress + amount);
    }
  }

  upgradeHero(heroId: string, levels = 1): CommandResult {
    const s = this.state;
    const hero = s.heroes[heroId];
    if (!hero || !hero.owned) return { ok: false, reason: '未拥有该英雄', events: [] };
    const nextLevel = hero.level + levels;
    if (!Number.isSafeInteger(levels) || levels < 1 || !Number.isSafeInteger(nextLevel)) {
      return { ok: false, reason: '升级等级无效', events: [] };
    }
    if (s.mode === 'classic' && nextLevel > BALANCE.heroMaxLevel) {
      return { ok: false, reason: '已达最高等级', events: [] };
    }
    const cfg = HEROES[heroId];
    let cost = 0;
    for (let level = hero.level; level < nextLevel && cost < BALANCE.goldCap; level++) {
      cost = Math.min(BALANCE.goldCap, cost + heroUpgradeCost(level, cfg.upgradeCostBase));
    }
    if (s.resources.gold < cost) return { ok: false, reason: '金币不足', events: [] };
    s.resources.gold -= cost;
    const ratio = this.heroHpRatio(heroId);
    hero.level = nextLevel;
    this.applyHeroStats(heroId, ratio);
    this.bumpMetric('upgrade_count', 1);
    this.emit({ type: 'hero_upgrade', at: s.time, heroId, level: hero.level });
    return { ok: true, events: [...this.events] };
  }

  private heroHpRatio(heroId: string): number {
    const u = this.state.units.find((x) => x.kind === 'hero' && x.templateId === heroId && x.phase !== 'dead');
    return u ? u.hp / u.maxHp : 1;
  }

  private applyHeroStats(heroId: string, ratio: number) {
    const stats = heroStatsOf(this.state, heroId);
    for (const u of this.state.units) {
      if (u.kind === 'hero' && u.templateId === heroId && u.phase !== 'dead') {
        u.maxHp = stats.hp;
        u.hp = Math.max(1, Math.round(stats.hp * ratio));
        u.attack = stats.atk;
        u.defense = stats.def;
        u.attackInterval = stats.attackInterval;
        u.range = stats.range;
        u.critChance = stats.critChance;
      }
    }
  }

  upgradeSquire(category: 'attack' | 'hp' | 'stock' | 'regen' | 'alive'): CommandResult {
    const s = this.state;
    const key = category === 'attack' ? 'attackLevel' : category === 'hp' ? 'hpLevel' : category === 'stock' ? 'stockLevel' : category === 'regen' ? 'regenLevel' : 'aliveLevel';
    const level = s.summon[key] as number;
    const cost = squireUpgradeCost(level);
    if (s.resources.gold < cost) return { ok: false, reason: '金币不足', events: [] };
    s.resources.gold -= cost;
    (s.summon as unknown as Record<string, number>)[key] = level + 1;
    this.applySummonGrowth();
    this.bumpMetric('upgrade_count', 1);
    this.emit({ type: 'squire_upgrade', at: s.time, category });
    return { ok: true, events: [...this.events] };
  }

  private applySummonGrowth() {
    const s = this.state;
    s.summon.inventoryMax = BALANCE.squireInventoryMax + 2 * s.summon.stockLevel;
    s.summon.regenPerSec = BALANCE.squireRegenPerSec + 0.25 * s.summon.regenLevel;
    s.summon.aliveMax = BALANCE.squireAliveMax + 2 * s.summon.aliveLevel;
    s.summon.inventory = Math.min(s.summon.inventoryMax, s.summon.inventory);
    const stats = squireStatsOf(s);
    for (const u of s.units) {
      if (u.kind === 'squire') {
        const ratio = u.hp / u.maxHp;
        u.maxHp = stats.hp;
        u.hp = Math.max(1, Math.round(stats.hp * ratio));
        u.attack = stats.atk;
        u.defense = stats.def;
        u.attackInterval = stats.attackInterval;
      }
    }
  }

  setAutoSummon(enabled: boolean, floorId: number | null): CommandResult {
    const s = this.state;
    if (enabled && floorId != null && !isFloorUnlocked(s, floorId)) return { ok: false, reason: '楼层未解锁', events: [] };
    s.summon.autoEnabled = enabled;
    s.summon.autoTargetFloor = floorId;
    this.emit({ type: 'auto_summon', at: s.time, enabled, floorId });
    return { ok: true, events: [...this.events] };
  }

  setGoldFloor(floorId: number | null): CommandResult {
    const s = this.state;
    if (floorId != null && !isFloorCleared(s, floorId)) {
      return { ok: false, reason: '仅可选择已首通的楼层', events: [] };
    }
    if (s.goldFloor != null && s.floors[s.goldFloor]) s.floors[s.goldFloor].isGoldFloor = false;
    s.goldFloor = floorId;
    if (floorId != null) this.ensureFloor(floorId).isGoldFloor = true;
    compactClearedFloors(s);
    this.emit({ type: 'gold_floor', at: s.time, floorId });
    return { ok: true, events: [...this.events] };
  }

  selectFloor(floorId: number): CommandResult {
    this.state.selectedFloor = floorId;
    return { ok: true, events: [] };
  }

  setMode(mode: GameMode): CommandResult {
    const s = this.state;
    if (mode !== 'classic' && mode !== 'endless') return { ok: false, reason: '游戏模式无效', events: [] };
    if (mode === s.mode) return { ok: true, events: [] };
    if (mode === 'classic' && Math.max(s.maxFloorUnlocked, s.highestClearedFloor) > BALANCE.floorsTotal) {
      return { ok: false, reason: '进度已超过 300 层，无法切换经典模式', events: [] };
    }
    s.mode = mode;
    normalizeGameState(s);
    this.emit({ type: 'mode_changed', at: s.time, mode });
    this.maybeUnlockNextSegment();
    return { ok: true, events: [...this.events] };
  }

  unlockNextSegment(): CommandResult {
    const status = this.canUnlockNextSegment();
    if (!status.ok) {
      const reason = status.missing.length === 0 ? '已是最高层' : `第 ${status.missing[0]} 层尚未通关`;
      return { ok: false, reason, events: [] };
    }
    this.openNextSegment();
    return { ok: true, events: [...this.events] };
  }

  private maybeUnlockNextSegment() {
    if (this.state.mode === 'endless' && this.canUnlockNextSegment().ok) this.openNextSegment();
  }

  private openNextSegment() {
    const s = this.state;
    const next = s.maxFloorUnlocked + BALANCE.floorsPerGate;
    const newMax = s.mode === 'classic' ? Math.min(BALANCE.floorsTotal, next) : next;
    for (let f = s.maxFloorUnlocked + 1; f <= newMax; f++) s.floors[f] = makeFloor(f, true);
    s.maxFloorUnlocked = newMax;
    compactClearedFloors(s);
    this.emit({ type: 'segment_unlocked', at: s.time, upTo: newMax });
  }

  canUnlockNextSegment(): { ok: boolean; missing: number[] } {
    const s = this.state;
    if ((s.mode === 'classic' && s.maxFloorUnlocked >= BALANCE.floorsTotal)
      || !Number.isSafeInteger(s.maxFloorUnlocked + BALANCE.floorsPerGate)) return { ok: false, missing: [] };
    const start = s.maxFloorUnlocked - BALANCE.floorsPerGate + 1;
    const missing: number[] = [];
    for (let f = start; f <= s.maxFloorUnlocked; f++) {
      const fl = s.floors[f];
      if (!fl || !fl.cleared) missing.push(f);
    }
    return { ok: missing.length === 0, missing };
  }

  getActiveSkillTargetFloor(): number {
    const s = this.state;
    // 每段预开放十层不代表已推进到段顶；空战场也以实际推进前线为目标。
    let floor = Math.min(s.maxFloorUnlocked, s.highestClearedFloor + 1);
    for (const entry of Object.values(s.floors)) {
      // 保留已交战楼层，最后一怪死亡或波次间隙不会让目标退回低层。
      if (entry.challenge === 'active' && isFloorUnlocked(s, entry.floorId)) floor = Math.max(floor, entry.floorId);
    }
    for (const unit of s.units) {
      if (unit.phase === 'dead' || unit.hp <= 0 || !isFloorUnlocked(s, unit.floorId)) continue;
      floor = Math.max(floor, unit.floorId);
    }
    return floor;
  }

  useActiveSkill(skill: 'battleCry' | 'lifeEcho' | 'crystalRain' | 'rapidAdvance'): CommandResult {
    const s = this.state;
    // 点击时重新锁定实际推进前线，旧的手动选层不参与；允许空目标施放。
    const floorId = this.getActiveSkillTargetFloor();
    const eventStart = this.events.length;
    const targets: { unitId: number; x: number; amount: number; floorId?: number }[] = [];
    let duration = 0;
    if (skill === 'rapidAdvance') {
      if (s.activeSkills.rapidAdvanceCooldown > 0) return { ok: false, reason: '冷却中', events: [] };
      duration = BALANCE.skillRapidAdvance.duration;
      s.activeSkills.rapidAdvanceUntil = s.time + duration;
      s.activeSkills.rapidAdvanceCooldown = BALANCE.skillRapidAdvance.cooldown;
      for (const u of s.units) {
        if (u.kind !== 'hero' || u.team !== 'ally' || u.phase === 'dead' || u.hp <= 0) continue;
        targets.push({ unitId: u.id, x: u.x / WIDTH, amount: 0, floorId: u.floorId });
      }
    } else if (skill === 'battleCry') {
      if (s.activeSkills.battleCryCooldown > 0) return { ok: false, reason: '冷却中', events: [] };
      const allies = this.alliesOnFloor(floorId).filter((u) => u.hp > 0);
      duration = BALANCE.skillBattleCry.duration;
      for (const u of allies) {
        u.atkBoostUntil = s.time + duration;
        u.atkBoostFactor = BALANCE.skillBattleCry.atkBoost;
        targets.push({ unitId: u.id, x: u.x / WIDTH, amount: 0 });
      }
      s.activeSkills.battleCryCooldown = BALANCE.skillBattleCry.cooldown;
    } else if (skill === 'lifeEcho') {
      if (s.activeSkills.lifeEchoCooldown > 0) return { ok: false, reason: '冷却中', events: [] };
      const wounded = this.alliesOnFloor(floorId).filter((u) => u.hp > 0 && u.hp < u.maxHp);
      for (const u of wounded) {
        const amount = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * BALANCE.skillLifeEcho.hpRatio));
        u.hp += amount;
        targets.push({ unitId: u.id, x: u.x / WIDTH, amount });
        this.emit({ type: 'heal', at: s.time, targetId: u.id, amount });
      }
      s.activeSkills.lifeEchoCooldown = BALANCE.skillLifeEcho.cooldown;
    } else {
      if (s.activeSkills.crystalRainCooldown > 0) return { ok: false, reason: '冷却中', events: [] };
      const enemies = this.enemiesOnFloor(floorId).filter((u) => u.hp > 0);
      const dmg = Math.round(BALANCE.skillCrystalRain.dmg + s.highestClearedFloor * BALANCE.skillCrystalRain.dmgScaling);
      for (const u of enemies) {
        const amount = Math.min(u.hp, dmg);
        u.hp -= amount;
        targets.push({ unitId: u.id, x: u.x / WIDTH, amount });
        this.emit({ type: 'hit', at: s.time, targetId: u.id, dmg: amount, crit: false });
        if (u.hp <= 0) { u.hp = 0; u.phase = 'dead'; this.onUnitKilled(u); }
      }
      s.activeSkills.crystalRainCooldown = BALANCE.skillCrystalRain.cooldown;
    }
    this.emit({
      type: 'active_skill', at: s.time, skill, floorId,
      ...(skill === 'rapidAdvance' ? { scope: 'allHeroes' } : {}),
      affectedCount: targets.length,
      totalAmount: targets.reduce((total, target) => total + target.amount, 0),
      duration, targets,
    });
    return { ok: true, events: this.events.slice(eventStart) };
  }

  recruit(): CommandResult {
    const s = this.state;
    if (s.resources.recruitTickets < 1) return { ok: false, reason: '招募券不足', events: [] };
    s.resources.recruitTickets -= 1;
    s.recruitCount += 1;
    const unowned = HERO_ORDER.filter((id) => !s.heroes[id].owned);
    if (unowned.length > 0) {
      const id = unowned[0];
      s.heroes[id].owned = true;
      s.heroes[id].enabled = true;
      this.deployNextHero();
      this.emit({ type: 'hero_recruited', at: s.time, heroId: id });
    } else {
      const id = HERO_ORDER[this.rng.int(0, HERO_ORDER.length - 1)];
      s.resources.soulShards[id] = (s.resources.soulShards[id] ?? 0) + BALANCE.duplicateSoulShards;
      this.emit({ type: 'hero_duplicate', at: s.time, heroId: id, shards: BALANCE.duplicateSoulShards });
    }
    this.bumpMetric('recruit_count', 1);
    return { ok: true, events: [...this.events] };
  }

  ascendHero(heroId: string): CommandResult {
    const s = this.state;
    const hero = s.heroes[heroId];
    if (!hero || !hero.owned) return { ok: false, reason: '未拥有该英雄', events: [] };
    if (hero.star >= BALANCE.heroMaxStar) return { ok: false, reason: '已达最高星级', events: [] };
    const cost = BALANCE.starCosts[hero.star] ?? 0;
    const shards = s.resources.soulShards[heroId] ?? 0;
    if (shards < cost) return { ok: false, reason: '英魂不足', events: [] };
    s.resources.soulShards[heroId] = shards - cost;
    hero.star += 1;
    this.applyHeroStats(heroId, this.heroHpRatio(heroId));
    this.emit({ type: 'hero_ascend', at: s.time, heroId, star: hero.star });
    return { ok: true, events: [...this.events] };
  }

  buyRecruitTicket(): CommandResult {
    const s = this.state;
    const price = Math.min(BALANCE.goldCap, Math.round(
      BALANCE.recruitTicketGoldPrice * Math.pow(BALANCE.recruitTicketGrowth, Math.max(0, s.recruitCount - 8)),
    ));
    if (s.resources.gold < price) return { ok: false, reason: '金币不足', events: [] };
    s.resources.gold -= price;
    s.resources.recruitTickets += 1;
    this.emit({ type: 'buy_ticket', at: s.time, price });
    return { ok: true, events: [...this.events] };
  }

  equipGem(gemId: string, slot: number): CommandResult {
    const s = this.state;
    const gem = s.gems.find((g) => g.id === gemId);
    if (!gem) return { ok: false, reason: '宝石不存在', events: [] };
    if (slot < 0 || slot >= s.gemBoard.length) return { ok: false, reason: '槽位无效', events: [] };
    const unlockedSlots = BALANCE.gemBoardInitialSlots + BALANCE.gemBoardUnlockFloors.filter((f) => s.highestClearedFloor >= f).length;
    if (slot >= unlockedSlots) return { ok: false, reason: '槽位未解锁', events: [] };
    if (s.gemBoard[slot]) return { ok: false, reason: '槽位已占用', events: [] };
    s.gems = s.gems.filter((g) => g.id !== gemId);
    s.gemBoard[slot] = gem;
    this.applyGemToUnits();
    this.bumpMetric('gem_equip_count', 1);
    this.emit({ type: 'gem_equip', at: s.time, gemId, slot });
    return { ok: true, events: [...this.events] };
  }

  unequipGem(slot: number): CommandResult {
    const s = this.state;
    const gem = s.gemBoard[slot];
    if (!gem) return { ok: false, reason: '槽位为空', events: [] };
    s.gemBoard[slot] = null;
    s.gems.push(gem);
    this.applyGemToUnits();
    this.emit({ type: 'gem_unequip', at: s.time, slot });
    return { ok: true, events: [...this.events] };
  }

  fuseGems(type: string): CommandResult {
    const s = this.state;
    const candidates = s.gems.filter((g) => g.type === type && !g.locked).sort((a, b) => a.level - b.level);
    const lowest = candidates.find((g) => g.level < BALANCE.gemMaxLevel);
    if (!lowest) return { ok: false, reason: '没有可合成的宝石', events: [] };
    const same = candidates.filter((g) => g.level === lowest.level);
    if (same.length < 3) return { ok: false, reason: `需要 3 颗 ${lowest.level} 级宝石`, events: [] };
    const cost = BALANCE.gemFuseCostBase * Math.pow(BALANCE.gemFuseCostGrowth, lowest.level - 1);
    if (s.resources.gold < cost) return { ok: false, reason: '金币不足', events: [] };
    s.resources.gold -= cost;
    const ids = new Set(same.slice(0, 3).map((g) => g.id));
    s.gems = s.gems.filter((g) => !ids.has(g.id));
    s.gems.push({ id: `gem_${Math.floor(s.time)}_${this.rng.int(0, 1e9)}`, type: type as never, level: lowest.level + 1, locked: false });
    this.bumpMetric('gem_fuse_count', 1);
    this.emit({ type: 'gem_fused', at: s.time, gemType: type, level: lowest.level + 1 });
    return { ok: true, events: [...this.events] };
  }

  private applyGemToUnits() {
    for (const u of this.state.units) {
      if (u.phase === 'dead') continue;
      if (u.kind === 'hero') {
        const stats = heroStatsOf(this.state, u.templateId);
        const ratio = u.hp / u.maxHp;
        u.maxHp = stats.hp; u.hp = Math.max(1, Math.round(stats.hp * ratio));
        u.attack = stats.atk; u.defense = stats.def; u.attackInterval = stats.attackInterval; u.range = stats.range; u.critChance = stats.critChance;
      } else if (u.kind === 'squire') {
        const stats = squireStatsOf(this.state);
        const ratio = u.hp / u.maxHp;
        u.maxHp = stats.hp; u.hp = Math.max(1, Math.round(stats.hp * ratio));
        u.attack = stats.atk; u.defense = stats.def; u.attackInterval = stats.attackInterval;
      }
    }
  }

  claimQuest(id: string): CommandResult {
    const s = this.state;
    const q = s.quests[id];
    if (!q) return { ok: false, reason: '任务不存在', events: [] };
    const def = QUESTS.find((x) => x.id === id);
    if (!def) return { ok: false, reason: '任务定义缺失', events: [] };
    if (q.claimed) return { ok: false, reason: '已领取', events: [] };
    if (q.progress < def.target) return { ok: false, reason: '未完成', events: [] };
    q.claimed = true;
    if (def.reward.gold) s.resources.gold = safeInt(s.resources.gold + def.reward.gold);
    if (def.reward.crystal) s.resources.crystal = safeInt(s.resources.crystal + def.reward.crystal);
    if (def.reward.recruitTickets) s.resources.recruitTickets += def.reward.recruitTickets;
    this.emit({ type: 'quest_claimed', at: s.time, id });
    return { ok: true, events: [...this.events] };
  }

  claimAchievement(id: string): CommandResult {
    const s = this.state;
    const a = s.achievements[id];
    if (!a) return { ok: false, reason: '成就不存在', events: [] };
    const def = ACHIEVEMENTS.find((x) => x.id === id);
    if (!def) return { ok: false, reason: '成就定义缺失', events: [] };
    if (a.claimed) return { ok: false, reason: '已领取', events: [] };
    if (a.progress < def.target) return { ok: false, reason: '未完成', events: [] };
    a.claimed = true;
    if (def.reward.crystal) s.resources.crystal = safeInt(s.resources.crystal + def.reward.crystal);
    if (def.reward.recruitTickets) s.resources.recruitTickets += def.reward.recruitTickets;
    this.emit({ type: 'achievement_claimed', at: s.time, id });
    return { ok: true, events: [...this.events] };
  }

  conquerStronghold(siteId: string): CommandResult {
    const s = this.state;
    if (s.highestClearedFloor < BALANCE.strongholdUnlockFloor) return { ok: false, reason: '未解锁据点', events: [] };
    const site = s.stronghold.sites[siteId] ?? { id: siteId, conquered: false, level: 1, lastCollectAt: s.time, stored: 0 };
    if (site.conquered) return { ok: false, reason: '已占领', events: [] };
    site.conquered = true;
    site.lastCollectAt = s.time;
    site.stored = 0;
    s.stronghold.sites[siteId] = site;
    this.emit({ type: 'stronghold_conquered', at: s.time, siteId });
    return { ok: true, events: [...this.events] };
  }

  collectStronghold(siteId: string): CommandResult {
    const s = this.state;
    const site = s.stronghold.sites[siteId];
    if (!site || !site.conquered) return { ok: false, reason: '未占领', events: [] };
    const amount = Math.floor(site.stored);
    site.stored -= amount;
    site.lastCollectAt = s.time;
    if (siteId === 'gold_mine') s.resources.gold = safeInt(s.resources.gold + amount);
    else if (siteId === 'dust_workshop') s.resources.upgradeDust = safeInt(s.resources.upgradeDust + amount);
    else s.resources.crystal = safeInt(s.resources.crystal + Math.floor(amount));
    this.emit({ type: 'stronghold_collected', at: s.time, siteId, amount });
    return { ok: true, events: [...this.events] };
  }

  setSetting<K extends keyof GameState['settings']>(key: K, value: GameState['settings'][K]): CommandResult {
    (this.state.settings as unknown as Record<string, unknown>)[key as string] = value;
    this.emit({ type: 'setting_changed', at: this.state.time, key: key as string });
    return { ok: true, events: [...this.events] };
  }

  setHeroOrder(order: string[]): CommandResult {
    if (!Array.isArray(order)) return { ok: false, reason: '英雄顺序无效', events: [] };
    const s = this.state;
    const nextOrder = normalizeHeroOrder(order);
    if (nextOrder.every((id, index) => id === s.heroOrder[index])) return { ok: true, events: [] };
    s.heroOrder = nextOrder;
    s.lastHeroDeployed = null;
    this.heroRanks = new Map(nextOrder.map((id, rank) => [id, rank]));
    this.emit({ type: 'hero_order', at: s.time });
    return { ok: true, events: [...this.events] };
  }

  setHeroEnabled(heroId: string, enabled: boolean): CommandResult {
    const hero = this.state.heroes[heroId];
    if (!hero || !hero.owned) return { ok: false, reason: '未拥有该英雄', events: [] };
    hero.enabled = enabled;
    if (enabled) this.deployNextHero();
    else {
      // 停用时移除其在场单位
      this.state.units = this.state.units.filter((u) => !(u.kind === 'hero' && u.templateId === heroId));
    }
    this.emit({ type: 'hero_enabled', at: this.state.time, heroId, enabled });
    return { ok: true, events: [...this.events] };
  }

  equipToHero(heroId: string, equipId: string): CommandResult {
    const s = this.state;
    const hero = s.heroes[heroId];
    const eq = s.equipment.find((e) => e.id === equipId);
    if (!hero || !hero.owned) return { ok: false, reason: '未拥有该英雄', events: [] };
    if (!eq) return { ok: false, reason: '装备不存在', events: [] };
    if (hero[eq.slot] === equipId) return { ok: false, reason: '已装备', events: [] };
    const affectedHeroes = new Map([[heroId, this.heroHpRatio(heroId)]]);
    // 同一装备只归一名英雄；转移时同时清空原穿戴者的槽位。
    for (const id of HERO_ORDER) {
      if (id !== heroId && s.heroes[id][eq.slot] === equipId) {
        affectedHeroes.set(id, this.heroHpRatio(id));
        s.heroes[id][eq.slot] = null;
      }
    }
    const previous = s.equipment.find((item) => item.id === hero[eq.slot]);
    if (previous) previous.equippedBy = null;
    hero[eq.slot] = equipId;
    eq.equippedBy = heroId;
    for (const [id, ratio] of affectedHeroes) this.applyHeroStats(id, ratio);
    this.emit({ type: 'equip', at: s.time, heroId, equipId });
    return { ok: true, events: [...this.events] };
  }

  get offlineRateEstimate(): number {
    const s = this.state;
    const enabledHeroes = HERO_ORDER.filter((id) => s.heroes[id].owned && s.heroes[id].enabled);
    if (enabledHeroes.length === 0) return 0;
    const floor = s.goldFloor ?? s.highestClearedFloor;
    if (floor <= 0) return 0;
    return monsterGoldAt(floor) * 2 * 0.3 * enabledHeroes.length * 0.5;
  }
}

function safeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(BALANCE.goldCap, Math.max(0, Math.floor(n)));
}

const GATE_GUARD: Record<number, string> = {
  1: 'enemy_bone_soldier',
  2: 'enemy_charred_guard',
  3: 'enemy_ice_sentinel',
};
