import { addClip, detectClipType, normalizeContent, normalizeHostname, pruneClips } from './lib/clips';
import { ensureState, readState, writeState } from './lib/storage';
import type { Clip, RuntimeMessage, RuntimeResponse, Settings, StorageState } from './lib/types';

const NATIVE_HOST = 'com.clipboardplus.native';

interface NativeHostResponse {
  ok: boolean;
  clips?: Clip[];
  hasMore?: boolean;
  error?: string;
}

function sendToNativeHost(message: { action: string; ids?: string[] }): Promise<NativeHostResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response: NativeHostResponse | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('The Clipboard+ companion did not respond.'));
        return;
      }
      resolve(response);
    });
  });
}

async function syncCompanion(): Promise<RuntimeResponse> {
  let state = await readState();
  try {
    let imported = 0;
    for (let batch = 0; batch < 20; batch += 1) {
      const response = await sendToNativeHost({ action: 'getPending' });
      if (!response.ok) throw new Error(response.error || 'The Clipboard+ companion returned an error.');
      const clips = response.clips ?? [];
      for (const clip of [...clips].sort((a, b) => a.updatedAt - b.updatedAt)) {
        state = addClip(
          state,
          {
            id: clip.id,
            content: clip.content,
            title: clip.title,
            sourceUrl: clip.sourceUrl,
            sourceApp: clip.sourceApp,
          },
          clip.updatedAt,
          clip.id,
        );
      }
      if (clips.length) {
        await writeState(state);
        const acknowledgement = await sendToNativeHost({ action: 'acknowledge', ids: clips.map((clip) => clip.id) });
        if (!acknowledgement.ok) throw new Error(acknowledgement.error || 'Could not acknowledge imported clips.');
        imported += clips.length;
      }
      if (!response.hasMore || clips.length === 0) break;
    }
    return { ok: true, state, companion: { available: true, imported } };
  } catch (error) {
    return {
      ok: true,
      state,
      companion: {
        available: false,
        imported: 0,
        error: error instanceof Error ? error.message : 'The Clipboard+ companion is unavailable.',
      },
    };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureState();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'clipboard-plus-selection',
      title: 'Save selection to Clipboard+',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'clipboard-plus-link',
      title: 'Save link to Clipboard+',
      contexts: ['link'],
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  void ensureState();
});

function updateClip(
  state: StorageState,
  id: string,
  changes: { content: string; title?: string },
): StorageState {
  const content = normalizeContent(changes.content);
  if (!content) throw new Error('Clipboard item is empty.');
  const original = state.clips.find((clip) => clip.id === id);
  if (!original) throw new Error('Clipboard item no longer exists.');

  const withoutOriginal = state.clips.filter((clip) => clip.id !== id);
  const duplicate = withoutOriginal.find((clip) => clip.content === content);
  if (duplicate) {
    return addClip(
      { ...state, clips: withoutOriginal },
      { content, title: changes.title || duplicate.title, sourceUrl: duplicate.sourceUrl },
      Date.now(),
      duplicate.id,
    );
  }

  const edited = {
    ...original,
    content,
    type: detectClipType(content),
    title: changes.title?.trim() || undefined,
    updatedAt: Date.now(),
  };
  return { ...state, clips: [edited, ...withoutOriginal].sort((a, b) => b.updatedAt - a.updatedAt) };
}

function sanitizeSettings(current: Settings, changes: Partial<Settings>): Settings {
  const historyLimit = [100, 250, 500, 1000].includes(Number(changes.historyLimit))
    ? Number(changes.historyLimit)
    : current.historyLimit;
  const excludedSites = changes.excludedSites
    ? [...new Set(changes.excludedSites.map(normalizeHostname).filter((site): site is string => Boolean(site)))]
    : current.excludedSites;
  return {
    autoCapture: typeof changes.autoCapture === 'boolean' ? changes.autoCapture : current.autoCapture,
    historyLimit,
    excludedSites,
  };
}

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  try {
    if (message.type === 'SYNC_COMPANION') return await syncCompanion();
    let state = await readState();
    switch (message.type) {
      case 'GET_STATE':
        return { ok: true, state };
      case 'ADD_CLIP':
        state = addClip(state, message.payload);
        break;
      case 'UPDATE_CLIP':
        state = updateClip(state, message.payload.id, message.payload);
        break;
      case 'TOGGLE_FAVORITE':
        state = {
          ...state,
          clips: state.clips.map((clip) =>
            clip.id === message.payload.id
              ? { ...clip, favorite: !clip.favorite, updatedAt: Date.now() }
              : clip,
          ),
        };
        state.clips.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'DELETE_CLIP':
        state = { ...state, clips: state.clips.filter((clip) => clip.id !== message.payload.id) };
        break;
      case 'UPDATE_SETTINGS':
        state = { ...state, settings: sanitizeSettings(state.settings, message.payload) };
        state.clips = pruneClips(state.clips, state.settings.historyLimit);
        break;
      case 'CLEAR_HISTORY':
        state = { ...state, clips: state.clips.filter((clip) => clip.favorite) };
        break;
      case 'CLEAR_ALL':
        state = { ...state, clips: [] };
        break;
      default:
        throw new Error('Unknown Clipboard+ action.');
    }
    await writeState(state);
    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unexpected error.' };
  }
}

let messageQueue = Promise.resolve<RuntimeResponse>({ ok: true });

function enqueueMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  messageQueue = messageQueue.then(
    () => handleMessage(message),
    () => handleMessage(message),
  );
  return messageQueue;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void enqueueMessage(message).then(sendResponse);
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const content = info.menuItemId === 'clipboard-plus-selection'
    ? info.selectionText
    : info.menuItemId === 'clipboard-plus-link'
      ? info.linkUrl
      : undefined;
  if (!content) return;
  void enqueueMessage({
    type: 'ADD_CLIP',
    payload: { content, title: tab?.title, sourceUrl: info.pageUrl },
  });
});
