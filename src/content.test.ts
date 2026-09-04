import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, STORAGE_KEY } from './lib/clips';

const sendMessage = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, onMessage: { addListener: vi.fn() } },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEY]: {
            ...DEFAULT_STATE,
            settings: {
              ...DEFAULT_STATE.settings,
              autoCapture: true,
              captureConsentVersion: 1,
              captureConsentAt: 1,
            },
          },
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
  });
  await import('./content');
  await Promise.resolve();
});

describe('web copy capture', () => {
  it('captures selected text from normal fields and ignores passwords', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'copy this text';
    document.body.append(textarea);
    textarea.setSelectionRange(0, textarea.value.length);
    textarea.dispatchEvent(new Event('copy', { bubbles: true }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CAPTURE_CLIP',
      payload: {
        content: 'copy this text',
        title: undefined,
        sourceUrl: 'http://localhost:3000/',
      },
    });

    sendMessage.mockClear();
    const password = document.createElement('input');
    password.type = 'password';
    password.value = 'do not capture';
    document.body.append(password);
    password.setSelectionRange(0, password.value.length);
    password.dispatchEvent(new Event('copy', { bubbles: true }));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
