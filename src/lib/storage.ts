import { DEFAULT_STATE, STORAGE_KEY, migrateState } from './clips';
import type { StorageState } from './types';

export async function readState(): Promise<StorageState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return migrateState(stored[STORAGE_KEY] ?? DEFAULT_STATE);
}

export async function writeState(state: StorageState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function ensureState(): Promise<StorageState> {
  const state = await readState();
  await writeState(state);
  return state;
}
