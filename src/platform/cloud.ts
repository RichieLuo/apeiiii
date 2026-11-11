import type { GameState } from '../game/core/types';

export interface CloudSave {
  version: number;
  state: unknown;
  updatedAt: string | null;
}

export class CloudError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function request<T>(path: string, options: {
  method?: 'POST' | 'PUT';
  body?: unknown;
  username?: string;
  timeout?: number;
} = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? 10_000);
  try {
    const headers = new Headers();
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.username) headers.set('X-Save-Account', options.username);
    const response = await fetch(`/api/${path}`, {
      method: options.method ?? 'GET',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const json = response.headers.get('Content-Type')?.includes('application/json')
      ? await response.json()
      : null;
    if (!response.ok || json === null) {
      throw new CloudError(response.status, json?.error ?? 'unavailable');
    }
    return json as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export const cloudApi = {
  session: () => request<{ username: string }>('auth/session', { timeout: 2500 }),
  authenticate: (action: 'register' | 'login', username: string, password: string) =>
    request<{ username: string }>(`auth/${action}`, { method: 'POST', body: { username, password } }),
  logout: () => request<void>('auth/logout', { method: 'POST' }),
  read: (username: string) => request<CloudSave>('save', { username }),
  write: (username: string, version: number, state: GameState) =>
    request<Omit<CloudSave, 'state'>>('save', { method: 'PUT', username, body: { version, state } }),
};
