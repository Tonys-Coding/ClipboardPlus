import { DEFAULT_STATE, STORAGE_KEY, maintainState, migrateState } from './clips';
import type { StorageState } from './types';

export async function readState(): Promise<StorageState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const source = stored[STORAGE_KEY] ?? DEFAULT_STATE;
  const state = maintainState(migrateState(source));
  if (JSON.stringify(source) !== JSON.stringify(state)) await writeState(state);
  return state;
}

export async function writeState(state: StorageState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function ensureState(): Promise<StorageState> {
  const state = await readState();
  await writeState(state);
  return state;
}
