import { pruneClips } from './clips';
import type { Clip, StorageState } from './types';

export const UNDO_STORAGE_KEY = 'clipboardPlusUndo';
export const UNDO_WINDOW_MS = 8_000;

interface DeleteTombstone {
  token: string;
  deletedAt: number;
  expiresAt: number;
  clip: Clip;
}

export type RestoreOutcome = 'inserted' | 'merged' | 'exists' | 'expired' | 'capacity';

export function createTombstone(
  clip: Clip,
  now = Date.now(),
  token: string = crypto.randomUUID(),
): DeleteTombstone {
  return { token, deletedAt: now, expiresAt: now + UNDO_WINDOW_MS, clip: structuredClone(clip) };
}

export function tombstoneIsUsable(
  tombstone: DeleteTombstone | null,
  token: string,
  now = Date.now(),
): tombstone is DeleteTombstone {
  if (!tombstone) return false;
  return tombstone.token === token && tombstone.expiresAt > now;
}

export function restoreDeletedClip(
  state: StorageState,
  tombstone: DeleteTombstone,
  now = Date.now(),
): { state: StorageState; outcome: RestoreOutcome } {
  const clip = tombstone.clip;

  if (state.clips.some((item) => item.id === clip.id)) return { state, outcome: 'exists' };

  const equivalent = state.clips.find((item) => item.content === clip.content);
  if (equivalent) {
    if (equivalent.favorite || !clip.favorite) return { state, outcome: 'exists' };
    return {
      state: {
        ...state,
        clips: pruneClips(
          state.clips.map((item) => (item.id === equivalent.id ? { ...item, favorite: true } : item)),
          state.settings.historyLimit,
        ),
      },
      outcome: 'merged',
    };
  }

  const { retentionDays } = state.settings;
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  if (retentionDays > 0 && !clip.favorite && clip.updatedAt < cutoff) return { state, outcome: 'expired' };

  // Restoring must never displace a newer capture, so a clip that would be pruned
  // straight back out is reported as a capacity problem instead of a silent no-op.
  const clips = pruneClips([clip, ...state.clips], state.settings.historyLimit);
  if (!clips.some((item) => item.id === clip.id)) return { state, outcome: 'capacity' };

  return { state: { ...state, clips }, outcome: 'inserted' };
}

export async function readTombstone(now = Date.now()): Promise<DeleteTombstone | null> {
  const stored = await chrome.storage.session.get(UNDO_STORAGE_KEY);
  const value = stored[UNDO_STORAGE_KEY];
  if (!value || typeof value !== 'object') return null;
  const tombstone = value as DeleteTombstone;
  // Session storage should not keep a deleted clip around after the offer has expired.
  if (!(tombstone.expiresAt > now)) {
    await clearTombstone();
    return null;
  }
  return tombstone;
}

export async function writeTombstone(tombstone: DeleteTombstone | null): Promise<void> {
  if (tombstone) await chrome.storage.session.set({ [UNDO_STORAGE_KEY]: tombstone });
  else await chrome.storage.session.remove(UNDO_STORAGE_KEY);
}

export async function clearTombstone(): Promise<void> {
  await writeTombstone(null);
}
