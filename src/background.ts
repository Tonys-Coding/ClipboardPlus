import { addClip, CAPTURE_CONSENT_VERSION, detectClipType, maintainState, normalizeContent, normalizeHostname, prepareCapturedClip, pruneClips } from './lib/clips';
import { COMPANION_ENABLED } from './lib/build';
import { CAPTURE_ORIGINS, captureIsAuthorized, hasWebsiteAccess } from './lib/capturePermissions';
import { ensureState, readState, writeState } from './lib/storage';
import type { Clip, ClipType, RetentionDays, RuntimeMessage, RuntimeResponse, Settings, StorageState } from './lib/types';

const NATIVE_HOST = 'com.clipboardplus.native';
const CAPTURE_SCRIPT_ID = 'clipboard-plus-web-capture';
const MAINTENANCE_ALARM = 'clipboard-plus-maintenance';

interface NativeHostResponse {
  ok: boolean;
  clips?: Clip[];
  hasMore?: boolean;
  error?: string;
}

function sendToNativeHost(message: { action: string; ids?: string[]; clips?: Clip[] }): Promise<NativeHostResponse> {
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

let companionConnected = false;

async function mirrorHistoryToCompanion(state: StorageState): Promise<void> {
  const favorites = state.clips.filter((clip) => clip.favorite).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = state.clips.filter((clip) => !clip.favorite).sort((a, b) => b.updatedAt - a.updatedAt);
  const response = await sendToNativeHost({ action: 'replaceHistory', clips: [...favorites, ...recent].slice(0, 500) });
  if (!response.ok) throw new Error(response.error || 'Could not update Quick Paste history.');
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
    await mirrorHistoryToCompanion(state);
    companionConnected = true;
    return {
      ok: true,
      state,
      permissions: { websiteAccess: await hasWebsiteAccess() },
      companion: { available: true, imported },
    };
  } catch (error) {
    companionConnected = false;
    return {
      ok: true,
      state,
      permissions: { websiteAccess: await hasWebsiteAccess() },
      companion: {
        available: false,
        imported: 0,
        error: error instanceof Error ? error.message : 'The Clipboard+ companion is unavailable.',
      },
    };
  }
}

async function syncCaptureRegistration(providedState?: StorageState): Promise<boolean> {
  const state = providedState ?? await readState();
  const websiteAccess = await hasWebsiteAccess();
  const shouldRegister = captureIsAuthorized(state.settings, websiteAccess);
  const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
  const isRegistered = registrations.length > 0;

  if (shouldRegister && !isRegistered) {
    await chrome.scripting.registerContentScripts([{
      id: CAPTURE_SCRIPT_ID,
      matches: CAPTURE_ORIGINS,
      js: ['content.js'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true,
    }]);
  } else if (!shouldRegister && isRegistered) {
    await chrome.scripting.unregisterContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
  }
  return websiteAccess;
}

async function initializeExtension(openOnboarding: boolean): Promise<void> {
  const state = await ensureState();
  chrome.alarms.create(MAINTENANCE_ALARM, { periodInMinutes: 60 });
  await syncCaptureRegistration(state);
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
  if (openOnboarding && state.settings.captureConsentVersion < CAPTURE_CONSENT_VERSION) {
    await chrome.runtime.openOptionsPage();
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void initializeExtension(details.reason === 'install');
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) void readState();
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (!permissions.origins?.some((origin) => CAPTURE_ORIGINS.includes(origin))) return;
  void (async () => {
    const state = await readState();
    const next = { ...state, settings: { ...state.settings, autoCapture: false } };
    await writeState(next);
    await syncCaptureRegistration(next);
  })();
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (!permissions.origins?.some((origin) => CAPTURE_ORIGINS.includes(origin))) return;
  void syncCaptureRegistration();
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
  const retentionDays = [0, 1, 7, 30, 90].includes(Number(changes.retentionDays))
    ? Number(changes.retentionDays) as RetentionDays
    : current.retentionDays;
  const captureTypes = changes.captureTypes
    ? [...new Set(changes.captureTypes.filter((type): type is ClipType => ['text', 'url', 'code'].includes(type)))]
    : current.captureTypes;
  const capturePaused = typeof changes.capturePaused === 'boolean'
    ? changes.capturePaused
    : current.capturePaused;
  const capturePausedUntil = !capturePaused
    ? null
    : changes.capturePausedUntil === null || typeof changes.capturePausedUntil === 'number'
      ? changes.capturePausedUntil
      : current.capturePausedUntil;
  return {
    autoCapture: typeof changes.autoCapture === 'boolean' ? changes.autoCapture : current.autoCapture,
    historyLimit,
    retentionDays,
    excludedSites,
    captureTypes: captureTypes.length ? captureTypes : current.captureTypes,
    capturePaused,
    capturePausedUntil,
    capturePageTitle: typeof changes.capturePageTitle === 'boolean'
      ? changes.capturePageTitle
      : current.capturePageTitle,
    captureSourceUrl: typeof changes.captureSourceUrl === 'boolean'
      ? changes.captureSourceUrl
      : current.captureSourceUrl,
    captureSourceApp: typeof changes.captureSourceApp === 'boolean'
      ? changes.captureSourceApp
      : current.captureSourceApp,
    captureConsentVersion: typeof changes.captureConsentVersion === 'number'
      ? Math.max(0, Math.floor(changes.captureConsentVersion))
      : current.captureConsentVersion,
    captureConsentAt: typeof changes.captureConsentAt === 'number'
      ? changes.captureConsentAt
      : current.captureConsentAt,
  };
}

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  try {
    if (message.type === 'SYNC_COMPANION') {
      if (!COMPANION_ENABLED) {
        const state = await readState();
        return { ok: true, state, permissions: { websiteAccess: await hasWebsiteAccess() } };
      }
      return await syncCompanion();
    }
    let state = await readState();
    let captureSettingsChanged = false;
    switch (message.type) {
      case 'GET_STATE':
        return { ok: true, state, permissions: { websiteAccess: await hasWebsiteAccess() } };
      case 'ADD_CLIP':
        state = addClip(state, message.payload);
        break;
      case 'CAPTURE_CLIP': {
        const captured = prepareCapturedClip(state.settings, {
          ...message.payload,
          sourceApp: message.payload.sourceApp || 'Google Chrome',
        });
        if (captured) state = addClip(state, captured);
        break;
      }
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
        state = maintainState(state);
        state.clips = pruneClips(state.clips, state.settings.historyLimit);
        captureSettingsChanged = true;
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
    const websiteAccess = captureSettingsChanged
      ? await syncCaptureRegistration(state)
      : await hasWebsiteAccess();
    if (COMPANION_ENABLED && companionConnected) {
      try {
        await mirrorHistoryToCompanion(state);
      } catch {
        companionConnected = false;
      }
    }
    return { ok: true, state, permissions: { websiteAccess } };
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
