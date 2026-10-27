import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEY } from './lib/clips';
import type { RuntimeMessage, RuntimeResponse, StorageState } from './lib/types';

// Simulates the compiled Chrome Web Store profile, where the companion flag is `false`
// and every native-messaging branch should be tree-shaken away.
vi.mock('./lib/build', () => ({ COMPANION_ENABLED: false }));

type MessageListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: RuntimeResponse) => void,
) => boolean;

const EXTENSION_ID = 'clipboard-plus-store-test';
const local = new Map<string, unknown>();
let messageListener: MessageListener | null = null;
let startupListener: (() => void) | null = null;
let alarmListener: ((alarm: { name: string }) => void) | null = null;
const sendNativeMessage = vi.fn();

function storageArea(map: Map<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => (map.has(key) ? { [key]: structuredClone(map.get(key)) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) map.set(key, structuredClone(value));
    }),
    remove: vi.fn(async (key: string) => {
      map.delete(key);
    }),
  };
}

function send(message: RuntimeMessage): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    messageListener?.(message, { id: EXTENSION_ID } as chrome.runtime.MessageSender, resolve);
  });
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  vi.resetModules();
  local.clear();
  messageListener = null;
  startupListener = null;
  alarmListener = null;
  sendNativeMessage.mockReset();
  local.set(STORAGE_KEY, { version: 2, clips: [], settings: { ...DEFAULT_SETTINGS } } satisfies StorageState);

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getManifest: vi.fn(() => ({ version: '1.8.4' })),
      onInstalled: { addListener: vi.fn() },
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
      sendNativeMessage,
    },
    storage: { local: storageArea(local), session: storageArea(new Map()) },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => []),
    },
    permissions: {
      contains: vi.fn(async () => false),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      onAlarm: {
        addListener: vi.fn((listener: (alarm: { name: string }) => void) => {
          alarmListener = listener;
        }),
      },
    },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: { addListener: vi.fn() } },
    tabs: { query: vi.fn(async () => []) },
  });

  await import('./background');
  await Promise.resolve();
});

describe('store profile companion isolation', () => {
  it('never registers the companion sync alarm or calls the native host', async () => {
    startupListener?.();
    await flushAsync();

    const createdAlarms = (chrome.alarms.create as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0] as string);
    expect(createdAlarms).toContain('clipboard-plus-maintenance');
    expect(createdAlarms).not.toContain('clipboard-plus-companion-sync');
    expect(sendNativeMessage).not.toHaveBeenCalled();
  });

  it('treats an alarm-triggered and a popup-triggered sync as local state reads only', async () => {
    alarmListener?.({ name: 'clipboard-plus-companion-sync' });
    const response = await send({ type: 'SYNC_COMPANION' });
    await flushAsync();

    expect(response.ok).toBe(true);
    expect(response.companion).toBeUndefined();
    expect(sendNativeMessage).not.toHaveBeenCalled();
  });
});
