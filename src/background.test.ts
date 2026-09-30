import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEY } from './lib/clips';
import { UNDO_STORAGE_KEY } from './lib/undo';
import type { Clip, RuntimeMessage, RuntimeResponse, Settings, StorageState } from './lib/types';

type SendResponse = (response: RuntimeResponse) => void;
type MessageListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
) => boolean;

const EXTENSION_ID = 'clipboard-plus-test';
const TRUSTED_SENDER = {
  id: EXTENSION_ID,
  origin: `chrome-extension://${EXTENSION_ID}`,
} as chrome.runtime.MessageSender;
const CONTENT_SCRIPT_SENDER = {
  id: EXTENSION_ID,
  origin: 'https://example.com',
  url: 'https://example.com/page',
  tab: { id: 7 },
} as unknown as chrome.runtime.MessageSender;

const local = new Map<string, unknown>();
const session = new Map<string, unknown>();
let messageListener: MessageListener | null = null;
let alarmListener: ((alarm: { name: string }) => void) | null = null;
let permissionRemovedListener: ((permissions: { origins?: string[] }) => void) | null = null;
let startupListener: (() => void) | null = null;
let installedListener: ((details: { reason: string }) => void) | null = null;
let localWriteFailures = 0;

interface NativeHost {
  pending: Clip[];
  acks: string[][];
  history: unknown[][];
  unavailable: boolean;
  gate: Promise<void> | null;
  inFlight: number;
  maxInFlight: number;
}

let native: NativeHost;

/** Emulates the native companion host: a pending queue that shrinks on acknowledge. */
function installNativeHost(): void {
  native = { pending: [], acks: [], history: [], unavailable: false, gate: null, inFlight: 0, maxInFlight: 0 };
  (chrome.runtime.sendNativeMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _host: string,
      message: { action: string; ids?: string[]; clips?: unknown[] },
      callback: (response: unknown) => void,
    ) => {
      void (async () => {
        native.inFlight += 1;
        native.maxInFlight = Math.max(native.maxInFlight, native.inFlight);
        try {
          if (native.gate) await native.gate;
          if (native.unavailable) {
            (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = {
              message: 'Specified native messaging host not found.',
            };
            callback(undefined);
            (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = undefined;
            return;
          }
          if (message.action === 'getPending') {
            callback({ ok: true, clips: structuredClone(native.pending), hasMore: false });
            return;
          }
          if (message.action === 'acknowledge') {
            const ids = message.ids ?? [];
            native.acks.push(ids);
            native.pending = native.pending.filter((clip) => !ids.includes(clip.id));
            callback({ ok: true });
            return;
          }
          if (message.action === 'replaceHistory') {
            native.history.push((message.clips as unknown[]) ?? []);
            callback({ ok: true });
            return;
          }
          callback({ ok: false, error: 'Unknown native action.' });
        } finally {
          native.inFlight -= 1;
        }
      })();
    },
  );
}

/** Drains the background service worker's promise chains and one macrotask. */
async function flushAsync(): Promise<void> {
  for (let index = 0; index < 60; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const makeClip = (id: string, updatedAt: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  type: 'text',
  content: `clip ${id}`,
  favorite: false,
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});

const authorizedSettings: Settings = {
  ...DEFAULT_SETTINGS,
  autoCapture: true,
  captureConsentVersion: 1,
  captureConsentAt: 1,
};

const stateWith = (clips: Clip[], settings: Partial<Settings> = {}): StorageState => ({
  version: 2,
  clips,
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

function storageArea(map: Map<string, unknown>, mayFail: boolean) {
  return {
    get: vi.fn(async (key: string) => (map.has(key) ? { [key]: structuredClone(map.get(key)) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      if (mayFail && localWriteFailures > 0) {
        localWriteFailures -= 1;
        throw new Error('QUOTA_BYTES quota exceeded');
      }
      for (const [key, value] of Object.entries(items)) map.set(key, structuredClone(value));
    }),
    remove: vi.fn(async (key: string) => {
      map.delete(key);
    }),
  };
}

function seedState(state: StorageState): void {
  local.set(STORAGE_KEY, structuredClone(state));
}

function storedState(): StorageState {
  return local.get(STORAGE_KEY) as StorageState;
}

function send(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender = TRUSTED_SENDER,
): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    messageListener?.(message, sender, resolve);
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  local.clear();
  session.clear();
  localWriteFailures = 0;
  messageListener = null;
  alarmListener = null;
  permissionRemovedListener = null;
  startupListener = null;
  installedListener = null;

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      onInstalled: {
        addListener: vi.fn((listener: (details: { reason: string }) => void) => {
          installedListener = listener;
        }),
      },
      onStartup: {
        addListener: vi.fn((listener: () => void) => {
          startupListener = listener;
        }),
      },
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListener = listener;
        }),
      },
      sendNativeMessage: vi.fn(),
    },
    storage: {
      local: storageArea(local, true),
      session: storageArea(session, false),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
    },
    permissions: {
      contains: vi.fn(async () => true),
      onAdded: { addListener: vi.fn() },
      onRemoved: {
        addListener: vi.fn((listener: (permissions: { origins?: string[] }) => void) => {
          permissionRemovedListener = listener;
        }),
      },
    },
    alarms: {
      create: vi.fn(),
      onAlarm: {
        addListener: vi.fn((listener: (alarm: { name: string }) => void) => {
          alarmListener = listener;
        }),
      },
    },
    contextMenus: {
      removeAll: vi.fn(),
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    tabs: { query: vi.fn(async () => []) },
  });
  installNativeHost();

  await import('./background');
  await Promise.resolve();
});

describe('service worker deletion and undo', () => {
  it('offers undo only after the deletion is durable and restores the same record', async () => {
    const original = makeClip('keep-me', 500, { favorite: true, title: 'Page title', sourceUrl: 'https://example.com/page' });
    seedState(stateWith([original, makeClip('other', 600)]));

    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'keep-me' } });
    expect(deleted.ok).toBe(true);
    expect(deleted.undo?.token).toBeTypeOf('string');
    expect(storedState().clips.map((clip) => clip.id)).toEqual(['other']);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(true);

    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(restored.ok).toBe(true);
    const back = restored.state?.clips.find((clip) => clip.id === 'keep-me');
    expect(back).toEqual(original);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);
  });

  it('never offers undo when the durable deletion fails', async () => {
    seedState(stateWith([makeClip('stays', 1)]));
    localWriteFailures = 1;

    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'stays' } });
    expect(deleted.ok).toBe(false);
    expect(deleted.error).toMatch(/quota/i);
    expect(storedState().clips.map((clip) => clip.id)).toEqual(['stays']);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);
  });

  it('replaces the previous offer on a repeated deletion and rejects a replayed token', async () => {
    seedState(stateWith([makeClip('first', 1), makeClip('second', 2)]));
    const first = await send({ type: 'DELETE_CLIP', payload: { id: 'first' } });
    const second = await send({ type: 'DELETE_CLIP', payload: { id: 'second' } });
    expect(second.undo!.token).not.toBe(first.undo!.token);

    const replay = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: first.undo!.token } });
    expect(replay.ok).toBe(false);
    expect(replay.error).toMatch(/expired/i);

    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: second.undo!.token } });
    expect(restored.ok).toBe(true);
    expect(restored.state?.clips.map((clip) => clip.id)).toEqual(['second']);
  });

  it('invalidates a pending offer when history is cleared', async () => {
    seedState(stateWith([makeClip('doomed', 1), makeClip('favorite', 2, { favorite: true })]));
    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'doomed' } });
    expect(session.has(UNDO_STORAGE_KEY)).toBe(true);

    const cleared = await send({ type: 'CLEAR_HISTORY' });
    expect(cleared.ok).toBe(true);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);

    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(restored.ok).toBe(false);
    expect(storedState().clips.map((clip) => clip.id)).toEqual(['favorite']);
  });

  it('refuses restoration from a content-script sender', async () => {
    seedState(stateWith([makeClip('private', 1)]));
    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'private' } });

    const restored = await send(
      { type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } },
      CONTENT_SCRIPT_SENDER,
    );
    expect(restored.ok).toBe(false);
    expect(restored.error).toMatch(/Clipboard\+ interface/);
    expect(storedState().clips.map((clip) => clip.id)).toEqual([]);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(true);
  });

  it('keeps the offer when the restore write fails, then succeeds on retry', async () => {
    seedState(stateWith([makeClip('retryable', 1)]));
    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'retryable' } });

    localWriteFailures = 1;
    const failed = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(failed.ok).toBe(false);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(true);

    const retried = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(retried.ok).toBe(true);
    expect(storedState().clips.map((clip) => clip.id)).toEqual(['retryable']);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);
  });

  it('reports capacity instead of quietly dropping a restored record', async () => {
    const clips = Array.from({ length: 100 }, (_value, index) => makeClip(`clip-${index + 1}`, index + 1));
    seedState(stateWith(clips, { historyLimit: 100 }));

    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'clip-1' } });
    await send({ type: 'ADD_CLIP', payload: { content: 'a newer capture' } });

    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(restored.ok).toBe(false);
    expect(restored.error).toMatch(/newer clips have filled your history limit/i);
    const ids = storedState().clips.map((clip) => clip.id);
    expect(ids).toContain('clip-100');
    expect(ids).not.toContain('clip-1');
    expect(ids).toHaveLength(100);
    // The offer is still usable inside its window, for example after freeing space.
    expect(session.has(UNDO_STORAGE_KEY)).toBe(true);
  });

  it('keeps a capture that arrived between the deletion and the undo', async () => {
    seedState(stateWith([makeClip('old', 1)], authorizedSettings));
    const deleted = await send({ type: 'DELETE_CLIP', payload: { id: 'old' } });

    const captured = await send({
      type: 'CAPTURE_CLIP',
      payload: { content: 'captured later', title: 'Page', sourceUrl: 'https://example.com' },
    });
    expect(captured.ok).toBe(true);

    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: deleted.undo!.token } });
    expect(restored.ok).toBe(true);
    const contents = restored.state?.clips.map((clip) => clip.content) ?? [];
    expect(contents).toContain('captured later');
    expect(contents).toContain('clip old');
  });

  it('drops an expired tombstone on read and during maintenance', async () => {
    session.set(UNDO_STORAGE_KEY, {
      token: 'stale',
      deletedAt: 1,
      expiresAt: Date.now() - 1,
      clip: makeClip('stale', 1),
    });
    const restored = await send({ type: 'RESTORE_DELETED_CLIP', payload: { token: 'stale' } });
    expect(restored.ok).toBe(false);
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);

    session.set(UNDO_STORAGE_KEY, {
      token: 'stale-2',
      deletedAt: 1,
      expiresAt: Date.now() - 1,
      clip: makeClip('stale-2', 1),
    });
    seedState(stateWith([makeClip('some', 1)]));
    alarmListener?.({ name: 'clipboard-plus-maintenance' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.has(UNDO_STORAGE_KEY)).toBe(false);
  });

  it('disables capture and unregisters the listener when website access is revoked externally', async () => {
    seedState(stateWith([makeClip('kept', 1)], authorizedSettings));
    (chrome.scripting.getRegisteredContentScripts as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ id: 'clipboard-plus-web-capture' }]);

    permissionRemovedListener?.({ origins: ['http://*/*'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storedState().settings.autoCapture).toBe(false);
    expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['clipboard-plus-web-capture'] });
  });

  it('ignores unrelated permission removals', async () => {
    seedState(stateWith([makeClip('kept', 1)], authorizedSettings));
    (chrome.scripting.getRegisteredContentScripts as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ id: 'clipboard-plus-web-capture' }]);

    permissionRemovedListener?.({ origins: ['https://other.example/*'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storedState().settings.autoCapture).toBe(true);
    expect(chrome.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });
});

describe('automatic companion queue sync', () => {
  it('imports queued native captures on startup without opening the popup', async () => {
    seedState(stateWith([makeClip('existing', 1)]));
    native.pending = [makeClip('native-newer', 20), makeClip('native-older', 10)];

    startupListener?.();
    await vi.waitFor(() => expect(storedState().clips).toHaveLength(3));

    expect(storedState().clips.map((clip) => clip.id)).toEqual(['native-newer', 'native-older', 'existing']);
    expect(native.acks).toEqual([['native-newer', 'native-older']]);
    expect(native.pending).toEqual([]);
  });

  it('imports queued native captures on the companion sync alarm', async () => {
    seedState(stateWith([]));
    native.pending = [makeClip('alarm-clip', 5)];

    alarmListener?.({ name: 'clipboard-plus-companion-sync' });
    await vi.waitFor(() => expect(storedState().clips.map((clip) => clip.id)).toEqual(['alarm-clip']));

    expect(native.acks).toEqual([['alarm-clip']]);
    expect(native.pending).toEqual([]);
  });

  it('imports queued native captures after a browser update', async () => {
    seedState(stateWith([]));
    native.pending = [makeClip('update-clip', 5)];

    installedListener?.({ reason: 'update' });
    await vi.waitFor(() => expect(storedState().clips.map((clip) => clip.id)).toEqual(['update-clip']));

    expect(native.acks).toEqual([['update-clip']]);
  });

  it('serializes overlapping startup, alarm, and popup syncs into one import each', async () => {
    seedState(stateWith([]));
    native.pending = [makeClip('concurrent-a', 1), makeClip('concurrent-b', 2)];

    let releaseGate: () => void = () => undefined;
    native.gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    startupListener?.();
    alarmListener?.({ name: 'clipboard-plus-companion-sync' });
    const popupSync = send({ type: 'SYNC_COMPANION' });

    await flushAsync();
    // Only one native round trip may be outstanding at a time.
    expect(native.maxInFlight).toBe(1);

    releaseGate();
    native.gate = null;
    await popupSync;
    await vi.waitFor(() => expect(storedState().clips).toHaveLength(2));

    expect(storedState().clips.map((clip) => clip.id).sort()).toEqual(['concurrent-a', 'concurrent-b']);
    const acknowledged = native.acks.flat();
    expect(acknowledged.filter((id) => id === 'concurrent-a')).toHaveLength(1);
    expect(acknowledged.filter((id) => id === 'concurrent-b')).toHaveLength(1);
  });

  it('does not acknowledge a batch whose storage write fails, then imports on retry', async () => {
    seedState(stateWith([]));
    native.pending = [makeClip('retry-clip', 1)];
    localWriteFailures = 1;

    alarmListener?.({ name: 'clipboard-plus-companion-sync' });
    await flushAsync();

    expect(native.acks).toEqual([]);
    expect(native.pending.map((clip) => clip.id)).toEqual(['retry-clip']);
    expect(storedState().clips).toEqual([]);

    alarmListener?.({ name: 'clipboard-plus-companion-sync' });
    await vi.waitFor(() => expect(storedState().clips.map((clip) => clip.id)).toEqual(['retry-clip']));

    expect(native.acks).toEqual([['retry-clip']]);
    expect(native.pending).toEqual([]);
  });

  it('reports the companion as unavailable without importing when the host is missing', async () => {
    seedState(stateWith([makeClip('kept', 1)]));
    native.pending = [makeClip('unreached', 1)];
    native.unavailable = true;

    const response = await send({ type: 'SYNC_COMPANION' });

    expect(response.companion?.available).toBe(false);
    expect(native.acks).toEqual([]);
    expect(native.pending.map((clip) => clip.id)).toEqual(['unreached']);
    expect(storedState().clips.map((clip) => clip.id)).toEqual(['kept']);
  });
});
