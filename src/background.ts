import { addClip, detectClipType, normalizeContent, normalizeHostname, pruneClips } from './lib/clips';
import { ensureState, readState, writeState } from './lib/storage';
import type { RuntimeMessage, RuntimeResponse, Settings, StorageState } from './lib/types';

chrome.runtime.onInstalled.addListener(() => { void ensureState(); });
chrome.runtime.onStartup.addListener(() => { void ensureState(); });

function updateClip(state: StorageState, id: string, changes: { content: string; title?: string }): StorageState {
  const content = normalizeContent(changes.content);
  if (!content) throw new Error('Clipboard item is empty.');
  const original = state.clips.find((clip) => clip.id === id);
  if (!original) throw new Error('Clipboard item no longer exists.');
  const rest = state.clips.filter((clip) => clip.id !== id);
  const duplicate = rest.find((clip) => clip.content === content);
  if (duplicate) return addClip({ ...state, clips: rest }, { content, title: changes.title || duplicate.title, sourceUrl: duplicate.sourceUrl }, Date.now(), duplicate.id);
  const edited = { ...original, content, type: detectClipType(content), title: changes.title?.trim() || undefined, updatedAt: Date.now() };
  return { ...state, clips: [edited, ...rest].sort((a, b) => b.updatedAt - a.updatedAt) };
}

function sanitizeSettings(current: Settings, changes: Partial<Settings>): Settings {
  return {
    autoCapture: typeof changes.autoCapture === 'boolean' ? changes.autoCapture : current.autoCapture,
    historyLimit: [100, 250, 500, 1000].includes(Number(changes.historyLimit)) ? Number(changes.historyLimit) : current.historyLimit,
    excludedSites: changes.excludedSites ? [...new Set(changes.excludedSites.map(normalizeHostname).filter((site): site is string => Boolean(site)))] : current.excludedSites,
  };
}

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  try {
    let state = await readState();
    switch (message.type) {
      case 'GET_STATE': return { ok: true, state };
      case 'ADD_CLIP': state = addClip(state, message.payload); break;
      case 'UPDATE_CLIP': state = updateClip(state, message.payload.id, message.payload); break;
      case 'TOGGLE_FAVORITE': state = { ...state, clips: state.clips.map((clip) => clip.id === message.payload.id ? { ...clip, favorite: !clip.favorite, updatedAt: Date.now() } : clip).sort((a, b) => b.updatedAt - a.updatedAt) }; break;
      case 'DELETE_CLIP': state = { ...state, clips: state.clips.filter((clip) => clip.id !== message.payload.id) }; break;
      case 'UPDATE_SETTINGS': state = { ...state, settings: sanitizeSettings(state.settings, message.payload) }; state.clips = pruneClips(state.clips, state.settings.historyLimit); break;
      case 'CLEAR_HISTORY': state = { ...state, clips: state.clips.filter((clip) => clip.favorite) }; break;
      case 'CLEAR_ALL': state = { ...state, clips: [] }; break;
      default: throw new Error('Unknown Clipboard+ action.');
    }
    await writeState(state);
    return { ok: true, state };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Unexpected error.' }; }
}

let queue = Promise.resolve<RuntimeResponse>({ ok: true });
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  queue = queue.then(() => handleMessage(message), () => handleMessage(message));
  void queue.then(sendResponse);
  return true;
});
