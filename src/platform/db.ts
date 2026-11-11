// IndexedDB 存档 —— 单一权威游戏状态。
import type { GameState } from '../game/core/types';
import { SCHEMA_VERSION, normalizeGameState } from '../game/core/state';

const DB_NAME = 'crystal-tower-expedition';
const DB_VERSION = 1;
const STORE_MAIN = 'save';
const STORE_BACKUP = 'backup';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MAIN)) db.createObjectStore(STORE_MAIN);
      if (!db.objectStoreNames.contains(STORE_BACKUP)) db.createObjectStore(STORE_BACKUP);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

const MAIN_KEY = 'state';
const BACKUP_KEY = 'backup';

async function writeSave(key: string, backupKey: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_MAIN, STORE_BACKUP], 'readwrite');
      const main = tx.objectStore(STORE_MAIN);
      const prev = main.get(key);
      prev.onsuccess = () => {
        if (prev.result) tx.objectStore(STORE_BACKUP).put(prev.result, backupKey);
        main.put(value, key);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function readSave<T>(key: string, backupKey: string): Promise<T | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const value = await get<T>(db, STORE_MAIN, key).catch(() => undefined);
    return value ?? await get<T>(db, STORE_BACKUP, backupKey) ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export const saveGame = (state: GameState) => writeSave(MAIN_KEY, BACKUP_KEY, state);
export const loadGame = () => readSave<GameState>(MAIN_KEY, BACKUP_KEY);

export function saveCloudCache(username: string, version: number, state: GameState) {
  const key = `account:${username}`;
  return writeSave(key, key, { version, state });
}

export function loadCloudCache(username: string) {
  const key = `account:${username}`;
  return readSave<{ version: number; state: GameState }>(key, key);
}

export async function clearSave(): Promise<void> {
  const db = await openDb();
  try {
    await put(db, STORE_MAIN, MAIN_KEY, null);
    await put(db, STORE_BACKUP, BACKUP_KEY, null);
  } finally {
    db.close();
  }
}

// 导出/导入 JSON
export function exportSave(state: GameState): string {
  return JSON.stringify(
    {
      schemaVersion: state.schemaVersion,
      contentVersion: state.contentVersion,
      exportedAt: new Date().toISOString(),
      seed: state.seed,
      state,
    },
    null,
    2,
  );
}

export function validateImport(json: unknown): { ok: boolean; reason?: string; state?: GameState } {
  try {
    const obj = json as { state?: GameState; schemaVersion?: number };
    const state = obj?.state;
    if (!state || typeof state !== 'object') return { ok: false, reason: '存档结构无效' };
    if (state.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: '存档版本不受支持' };
    if (state.mode !== undefined && state.mode !== 'endless' && state.mode !== 'classic') return { ok: false, reason: '游戏模式无效' };
    if (typeof state.resources !== 'object' || state.resources === null) return { ok: false, reason: '缺少资源数据' };
    if (!Array.isArray(state.units)) return { ok: false, reason: '缺少单位数据' };
    if (!state.floors || typeof state.floors !== 'object') return { ok: false, reason: '缺少楼层数据' };
    if (!Number.isSafeInteger(state.maxFloorUnlocked) || state.maxFloorUnlocked < 10
      || !Number.isSafeInteger(state.highestClearedFloor) || state.highestClearedFloor < 0
      || state.highestClearedFloor > state.maxFloorUnlocked) return { ok: false, reason: '楼层进度无效' };
    if (!state.rng || !Number.isFinite(state.time) || !state.summon || !state.activeSkills || !state.settings
      || !state.quests || !state.achievements || !state.stronghold?.sites || !state.arena
      || !Array.isArray(state.gems) || !Array.isArray(state.gemBoard) || !Array.isArray(state.equipment)
      || !state.heroes || typeof state.heroes !== 'object' || Array.isArray(state.heroes)) {
      return { ok: false, reason: '存档数据不完整' };
    }
    if (!Object.values(state.heroes).every((hero) => hero && typeof hero.owned === 'boolean'
      && typeof hero.enabled === 'boolean' && Number.isSafeInteger(hero.level) && hero.level >= 1
      && Number.isSafeInteger(hero.star) && hero.star >= 1 && hero.star <= 5)) {
      return { ok: false, reason: '英雄数据无效' };
    }
    // 数值范围校验（拒绝 NaN / Infinity / 负数）
    const gold = state.resources.gold;
    if (!Number.isFinite(gold) || gold < 0) return { ok: false, reason: '资源数值非法' };
    return { ok: true, state: normalizeGameState(state) };
  } catch {
    return { ok: false, reason: 'JSON 解析失败' };
  }
}
