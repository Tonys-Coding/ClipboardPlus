import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from './clips';
import {
  UNDO_STORAGE_KEY,
  UNDO_WINDOW_MS,
  clearTombstone,
  createTombstone,
  readTombstone,
  restoreDeletedClip,
  tombstoneIsUsable,
  writeTombstone,
} from './undo';
import type { Clip, StorageState } from './types';

const makeClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'deleted',
  type: 'text',
  content: 'Deleted content',
  favorite: false,
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

const stateWith = (clips: Clip[], retentionDays: StorageState['settings']['retentionDays'] = 0): StorageState => ({
  ...DEFAULT_STATE,
  settings: { ...DEFAULT_STATE.settings, retentionDays },
  clips,
});

describe('delete undoTombstone', () => {
  it('snapshots the deleted clip and expires after the undo window', () => {
    const clip = makeClip();
    const tombstone = createTombstone(clip, 1_000, 'token-1');
    expect(tombstone).toMatchObject({ token: 'token-1', deletedAt: 1_000, expiresAt: 1_000 + UNDO_WINDOW_MS });
    expect(tombstone.clip).toEqual(clip);
    expect(tombstone.clip).not.toBe(clip);
  });

  it('accepts only the matching, unexpired token', () => {
    const tombstone = createTombstone(makeClip(), 1_000, 'token-1');
    expect(tombstoneIsUsable(tombstone, 'token-1', 1_000)).toBe(true);
    expect(tombstoneIsUsable(tombstone, 'token-2', 1_000)).toBe(false);
    expect(tombstoneIsUsable(tombstone, 'token-1', tombstone.expiresAt)).toBe(false);
    expect(tombstoneIsUsable(null, 'token-1', 1_000)).toBe(false);
  });

  it('restores original identity, timestamps, favorite, and metadata', () => {
    const clip = makeClip({
      id: 'keep-me',
      favorite: true,
      title: 'Page title',
      sourceUrl: 'https://example.com/page',
      sourceApp: 'Google Chrome',
    });
    const state = stateWith([makeClip({ id: 'other', content: 'Other', updatedAt: 500 })]);
    const result = restoreDeletedClip(state, createTombstone(clip, 1_000, 'token-1'), 1_100);
    expect(result.outcome).toBe('inserted');
    expect(result.state.clips.find((item) => item.id === 'keep-me')).toEqual(clip);
    expect(result.state.clips).toHaveLength(2);
  });

  it('merges favorite preservation into existing equivalent content without duplicating', () => {
    const existing = makeClip({ id: 'survivor', content: 'Deleted content', favorite: false, updatedAt: 900 });
    const tombstone = createTombstone(makeClip({ id: 'gone', favorite: true }), 1_000, 'token-1');
    const result = restoreDeletedClip(stateWith([existing]), tombstone, 1_100);
    expect(result.outcome).toBe('merged');
    expect(result.state.clips).toHaveLength(1);
    expect(result.state.clips[0]).toMatchObject({ id: 'survivor', favorite: true, updatedAt: 900 });
  });

  it('reports an existing id without replacing newer state', () => {
    const edited = makeClip({ id: 'deleted', content: 'Edited after delete', updatedAt: 5_000 });
    const result = restoreDeletedClip(stateWith([edited]), createTombstone(makeClip(), 1_000, 'token-1'), 1_100);
    expect(result.outcome).toBe('exists');
    expect(result.state.clips[0]).toEqual(edited);
  });

  it('refuses to restore a non-favorite clip that retention already expired', () => {
    const old = makeClip({ updatedAt: 1_000 });
    const day = 24 * 60 * 60 * 1000;
    const result = restoreDeletedClip(stateWith([], 1), createTombstone(old, day * 3, 'token-1'), day * 3);
    expect(result.outcome).toBe('expired');
    expect(result.state.clips).toHaveLength(0);

    const favorite = restoreDeletedClip(stateWith([], 1), createTombstone({ ...old, favorite: true }, day * 3, 'token-2'), day * 3);
    expect(favorite.outcome).toBe('inserted');
  });

  it('reports capacity when the restored record would be pruned immediately', () => {
    const clips = [
      makeClip({ id: 'newer-1', content: 'newer one', updatedAt: 900 }),
      makeClip({ id: 'newer-2', content: 'newer two', updatedAt: 800 }),
    ];
    const state: StorageState = {
      ...stateWith(clips),
      settings: { ...DEFAULT_STATE.settings, historyLimit: 2 },
    };
    const result = restoreDeletedClip(
      state,
      createTombstone(makeClip({ id: 'oldest', content: 'the oldest clip', updatedAt: 10 }), 1_000, 'token-1'),
      1_100,
    );
    expect(result.outcome).toBe('capacity');
    expect(result.state.clips.map((clip) => clip.id)).toEqual(['newer-1', 'newer-2']);
  });
});

describe('undo session storage', () => {
  const store = new Map<string, unknown>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {})),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) store.set(key, value);
          }),
          remove: vi.fn(async (key: string) => {
            store.delete(key);
          }),
        },
      },
    });
  });

  it('round-trips a tombstone through session storage and clears it', async () => {
    expect(await readTombstone()).toBeNull();
    const tombstone = createTombstone(makeClip(), Date.now(), 'token-1');
    await writeTombstone(tombstone);
    expect(store.has(UNDO_STORAGE_KEY)).toBe(true);
    expect(await readTombstone()).toEqual(tombstone);
    await clearTombstone();
    expect(store.has(UNDO_STORAGE_KEY)).toBe(false);
    expect(await readTombstone()).toBeNull();
  });

  it('removes an expired tombstone instead of retaining the deleted clip', async () => {
    const tombstone = createTombstone(makeClip(), 1_000, 'token-1');
    await writeTombstone(tombstone);
    expect(await readTombstone(tombstone.expiresAt)).toBeNull();
    expect(store.has(UNDO_STORAGE_KEY)).toBe(false);
  });
});
