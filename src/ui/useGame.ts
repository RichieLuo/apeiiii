// React 订阅 hook —— 通过 useSyncExternalStore 订阅只读快照。
import { useSyncExternalStore } from 'react';
import { store } from '../platform/store';

export function useGame() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
