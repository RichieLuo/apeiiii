// 游戏状态 Store —— 连接模拟内核、React 面板与 Phaser 渲染。
// 状态不依赖 React 生命周期；React 订阅只读快照，命令改变状态。
import type { GameMode, GameState } from '../game/core/types';
import { Simulation, type CommandResult } from '../game/core/simulation';
import { createNewGame, safeAdd } from '../game/core/state';
import { saveGame, loadGame, saveCloudCache, loadCloudCache, validateImport } from './db';
import { cloudApi, CloudError, type CloudSave } from './cloud';
import { AudioEngine } from './audio';

export type CommandName =
  | 'summon'
  | 'upgradeHero'
  | 'upgradeSquire'
  | 'setAutoSummon'
  | 'setGoldFloor'
  | 'selectFloor'
  | 'unlockNextSegment'
  | 'useActiveSkill'
  | 'recruit'
  | 'ascendHero'
  | 'buyRecruitTicket'
  | 'equipGem'
  | 'unequipGem'
  | 'fuseGems'
  | 'claimQuest'
  | 'claimAchievement'
  | 'conquerStronghold'
  | 'collectStronghold'
  | 'setSetting'
  | 'setMode'
  | 'setHeroEnabled'
  | 'setHeroOrder'
  | 'equipToHero';

export interface UiSnapshot {
  version: number;
  state: GameState;
  canUnlock: { ok: boolean; missing: number[] };
  offlineEstimate: number;
  cloud: CloudAccount | null;
}

const UI_NOTIFY_MS = 100;
const CLOUD_SESSION_KEY = 'crystal-tower-cloud-session';

interface CloudAccount {
  username: string;
  status: 'pending' | 'synced' | 'offline' | 'conflict' | 'expired';
}

interface CloudSession extends CloudAccount {
  version: number;
  pending: Promise<void> | null;
}

function rememberSession(active: boolean) {
  try {
    if (active) localStorage.setItem(CLOUD_SESSION_KEY, '1');
    else localStorage.removeItem(CLOUD_SESSION_KEY);
  } catch { /* 浏览器限制存储时仍可在当前页面同步。 */ }
}

class GameStore {
  private _state: GameState | null = null;
  private _sim: Simulation | null = null;
  private cloud: CloudSession | null = null;
  private listeners = new Set<() => void>();
  private uiVersion = 0;
  private lastUiNotify = 0;
  private cachedSnapshot: UiSnapshot | null = null;
  private cachedSnapshotVersion = -1;
  audio = new AudioEngine();

  get state(): GameState {
    if (!this._state) throw new Error('store 未初始化');
    return this._state;
  }

  get sim(): Simulation {
    if (!this._sim) throw new Error('store 未初始化');
    return this._sim;
  }

  get ready(): boolean {
    return this._state !== null;
  }

  async init(): Promise<{ isNew: boolean }> {
    const loaded = await loadGame();
    this.replaceState(loaded ?? createNewGame());
    if (loaded) this.applyOffline(loaded);
    try {
      if (localStorage.getItem(CLOUD_SESSION_KEY)) {
        const { username } = await cloudApi.session();
        await this.openCloud(username);
      }
    } catch (error) {
      if (error instanceof CloudError && error.status === 401) rememberSession(false);
    }
    void this.save();
    this.notify(true);
    return { isNew: !loaded && !this.cloud };
  }

  private replaceState(state: GameState) {
    this._state = state;
    this._sim = new Simulation(state);
  }

  private applyOffline(state: GameState) {
    // 离线金币结算（页面恢复可见后调用）
    const now = Math.floor(Date.now() / 1000);
    const last = state.accountedThrough || now;
    if (now <= last) return;
    let elapsed = now - last;
    const maxSec = 8 * 3600;
    elapsed = Math.min(elapsed, maxSec);
    if (elapsed <= 0) return;
    const rate = this._sim ? this._sim.offlineRateEstimate : 0;
    const gold = Math.floor(elapsed * rate * 0.8);
    if (gold > 0) {
      state.resources.gold = safeAdd(state.resources.gold, gold);
      state.lastOfflineReward = { seconds: elapsed, gold, at: now };
    }
    state.accountedThrough = now;
    state.offlineRewardPending = gold > 0;
  }

  // 由 Phaser 每帧驱动
  step(dt: number) {
    if (!this._sim) return;
    this._sim.step(dt);
    this.notify(); // 节流通知 React 刷新 UI
  }

  // React 订阅（节流通知）
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify(force = false) {
    const now = performance.now();
    if (!force && now - this.lastUiNotify < UI_NOTIFY_MS) return;
    this.lastUiNotify = now;
    this.uiVersion++;
    for (const fn of this.listeners) fn();
  }

  getSnapshot = (): UiSnapshot => {
    if (this.cachedSnapshot && this.cachedSnapshotVersion === this.uiVersion) {
      return this.cachedSnapshot;
    }
    const s = this.state;
    this.cachedSnapshot = {
      version: this.uiVersion,
      state: s,
      canUnlock: this._sim ? this._sim.canUnlockNextSegment() : { ok: false, missing: [] },
      offlineEstimate: this._sim ? this._sim.offlineRateEstimate : 0,
      cloud: this.cloud && {
        username: this.cloud.username,
        status: this.cloud.status,
      },
    };
    this.cachedSnapshotVersion = this.uiVersion;
    return this.cachedSnapshot;
  };

  dispatch(cmd: CommandName, ...args: unknown[]): CommandResult {
    if (!this._sim) return { ok: false, reason: '未初始化', events: [] };
    let result: CommandResult = { ok: false, reason: '未知命令', events: [] };
    switch (cmd) {
      case 'summon': result = this._sim.spawnSquire(args[0] as number); break;
      case 'upgradeHero': result = this._sim.upgradeHero(args[0] as string, (args[1] as number) ?? 1); break;
      case 'upgradeSquire': result = this._sim.upgradeSquire(args[0] as never); break;
      case 'setAutoSummon': result = this._sim.setAutoSummon(args[0] as boolean, args[1] as number | null); break;
      case 'setGoldFloor': result = this._sim.setGoldFloor(args[0] as number | null); break;
      case 'selectFloor': result = this._sim.selectFloor(args[0] as number); break;
      case 'unlockNextSegment': result = this._sim.unlockNextSegment(); break;
      case 'useActiveSkill': result = this._sim.useActiveSkill(args[0] as never, args[1] as number); break;
      case 'recruit': result = this._sim.recruit(); break;
      case 'ascendHero': result = this._sim.ascendHero(args[0] as string); break;
      case 'buyRecruitTicket': result = this._sim.buyRecruitTicket(); break;
      case 'equipGem': result = this._sim.equipGem(args[0] as string, args[1] as number); break;
      case 'unequipGem': result = this._sim.unequipGem(args[0] as number); break;
      case 'fuseGems': result = this._sim.fuseGems(args[0] as string); break;
      case 'claimQuest': result = this._sim.claimQuest(args[0] as string); break;
      case 'claimAchievement': result = this._sim.claimAchievement(args[0] as string); break;
      case 'conquerStronghold': result = this._sim.conquerStronghold(args[0] as string); break;
      case 'collectStronghold': result = this._sim.collectStronghold(args[0] as string); break;
      case 'setSetting': result = this._sim.setSetting(args[0] as never, args[1] as never); break;
      case 'setMode': result = this._sim.setMode(args[0] as GameMode); break;
      case 'setHeroEnabled': result = this._sim.setHeroEnabled(args[0] as string, args[1] as boolean); break;
      case 'setHeroOrder': result = this._sim.setHeroOrder(args[0] as string[]); break;
      case 'equipToHero': result = this._sim.equipToHero(args[0] as string, args[1] as string); break;
    }
    if (result.ok) {
      this._state!.revision++;
      this.playCommandSfx(cmd);
      this.save();
      this.notify(true);
    }
    return result;
  }

  private playCommandSfx(cmd: CommandName) {
    if (cmd === 'summon') this.audio.sfx('summon');
    else if (cmd === 'upgradeHero' || cmd === 'upgradeSquire') this.audio.sfx('upgrade');
    else if (cmd === 'recruit') this.audio.sfx('upgrade');
    else if (cmd === 'fuseGems') this.audio.sfx('fuse');
    else this.audio.sfx('click');
  }

  save = async () => {
    if (!this._state) return;
    const state = this._state;
    state.accountedThrough = Math.floor(Date.now() / 1000);
    const cloud = this.cloud;
    if (!cloud) {
      await saveGame(state).catch(() => {});
      return;
    }
    await saveCloudCache(cloud.username, cloud.version, state).catch(() => {});
    if (this.cloud !== cloud || this._state !== state || cloud.status === 'conflict' || cloud.status === 'expired') return;
    cloud.pending ??= this.syncCloud(cloud, state);
    await cloud.pending;
  };

  private async syncCloud(cloud: CloudSession, state: GameState) {
    try {
      const result = await cloudApi.write(cloud.username, cloud.version, state);
      cloud.version = result.version;
      cloud.status = 'synced';
      if (this.cloud === cloud) {
        await saveCloudCache(cloud.username, cloud.version, this.state).catch(() => {});
      }
    } catch (error) {
      cloud.status = error instanceof CloudError && error.status === 409 ? 'conflict'
        : error instanceof CloudError && error.status === 401 ? 'expired' : 'offline';
    } finally {
      cloud.pending = null;
      if (this.cloud === cloud) this.notify(true);
    }
  }

  async authenticate(action: 'register' | 'login', username: string, password: string) {
    const account = await cloudApi.authenticate(action, username, password);
    rememberSession(true);
    await this.openCloud(account.username);
    await this.save();
  }

  private async openCloud(username: string) {
    const [remote, cached] = await Promise.all([cloudApi.read(username), loadCloudCache(username)]);
    const remoteState = this.readRemoteState(remote);
    // 同一云端版本下可以续用本机尚未传完的进度。
    const localState = cached?.version === remote.version
      && (!remoteState || cached.state.accountedThrough >= remoteState.accountedThrough)
      && (!remoteState || cached.state.time >= remoteState.time) ? cached.state : null;
    if (!this.cloud) await saveGame(this.state).catch(() => {});
    const loaded = localState ?? remoteState;
    if (loaded) this.replaceState(loaded);
    else if (this.cloud && this.cloud.username !== username) this.replaceState(await loadGame() ?? createNewGame());
    else this.replaceState(structuredClone(this.state));
    if (loaded) this.applyOffline(loaded);
    this.cloud = {
      username, version: remote.version,
      status: 'pending', pending: null,
    };
    this.notify(true);
  }

  async reloadCloud() {
    const cloud = this.cloud;
    if (!cloud) return;
    await cloud.pending;
    const remote = await cloudApi.read(cloud.username);
    const state = this.readRemoteState(remote);
    if (state) {
      this.replaceState(state);
      this.applyOffline(state);
    }
    cloud.version = remote.version;
    cloud.status = 'pending';
    this.notify(true);
    await this.save();
  }

  private readRemoteState(remote: CloudSave) {
    if (remote.state === null) return null;
    const result = validateImport({ state: remote.state });
    if (!result.ok || !result.state) throw new CloudError(400, 'invalid_save');
    return result.state;
  }

  async signOut() {
    await this.cloud?.pending;
    await this.save();
    await cloudApi.logout();
    rememberSession(false);
    this.cloud = null;
    const guest = await loadGame();
    this.replaceState(guest ?? createNewGame());
    if (guest) this.applyOffline(guest);
    this.notify(true);
    void this.save();
  }

  resume() {
    if (!this._state) return;
    this.applyOffline(this._state);
    this.notify(true);
    void this.save();
  }

  // 战斗事件音效（由渲染/事件层触发）
  notifyEvents() {
    if (!this._sim) return;
    for (const ev of this._sim.events) {
      if (ev.type === 'hit') this.audio.sfx('hit');
      else if (ev.type === 'enemy_killed') this.audio.sfx('hit');
      else if (ev.type === 'gate_cleared') this.audio.sfx('victory');
    }
    this._sim.events.length = 0;
  }

  // 确认离线收益（只清除待展示标记，奖励已在 load 时入账）
  ackOffline() {
    if (this._state) {
      this._state.offlineRewardPending = false;
      this.notify(true);
    }
  }

  // 直接装备（简化面板用）
  equipTo(heroId: string, eq: { id: string }) {
    this.dispatch('equipToHero', heroId, eq.id);
  }

  // 导入存档（替换当前进度）
  importState(state: GameState) {
    this.replaceState(state);
    this.notify(true);
    this.save();
  }
}

export const store = new GameStore();
