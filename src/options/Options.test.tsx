import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/clips';
import { sendMessage } from '../lib/runtime';
import type { StorageState } from '../lib/types';
import { Options } from './Options';

vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));

const state: StorageState = {
  version: 2,
  clips: [],
  settings: { ...DEFAULT_SETTINGS, autoCapture: true, captureConsentVersion: 1, captureConsentAt: 1 },
};

describe('Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state, permissions: { websiteAccess: true } });
    vi.stubGlobal('chrome', {
      permissions: {
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      },
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('updates capture, history limit, exclusions, and clear actions', async () => {
    const user = userEvent.setup();
    render(<Options />);
    await screen.findByText('Automatic web capture');
    await user.click(screen.getByRole('checkbox', { name: 'Automatic web capture' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { autoCapture: false } });
    expect(chrome.permissions.remove).toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('History limit'), '250');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { historyLimit: 250 } });

    await user.type(screen.getByLabelText('Site to exclude'), 'https://www.example.com/path');
    await user.click(screen.getByRole('button', { name: 'Add site' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { excludedSites: ['example.com'] } });

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' });
  });

  it('requires an affirmative permission grant before enabling automatic capture', async () => {
    const user = userEvent.setup();
    const unconsented: StorageState = {
      ...state,
      settings: { ...state.settings, autoCapture: false, captureConsentVersion: 0, captureConsentAt: undefined },
    };
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state: unconsented, permissions: { websiteAccess: false } });
    render(<Options />);
    await user.click(await screen.findByRole('button', { name: 'Enable website capture' }));
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_SETTINGS',
      payload: expect.objectContaining({ autoCapture: true, captureConsentVersion: 1 }),
    }));
  });

  it('keeps capture off and explains recovery when website access is denied', async () => {
    const user = userEvent.setup();
    const unconsented: StorageState = {
      ...state,
      settings: { ...state.settings, autoCapture: false, captureConsentVersion: 0, captureConsentAt: undefined },
    };
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state: unconsented, permissions: { websiteAccess: false } });
    (chrome.permissions.request as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    render(<Options />);
    await user.click(await screen.findByRole('button', { name: 'Enable website capture' }));
    expect(await screen.findByText(/Website access was not granted/)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_SETTINGS',
      payload: expect.objectContaining({ autoCapture: true }),
    }));
  });

  it('moves the top spotlight and renders the supplied side artwork', async () => {
    const { container } = render(<Options />);
    await screen.findByText('Automatic web capture');

    expect(container.querySelectorAll('img[src="/assets/clipboard-plus-single.png"]')).toHaveLength(6);
    const pointerMove = new Event('pointermove');
    Object.defineProperties(pointerMove, {
      clientX: { value: 320 },
      clientY: { value: 480 },
      pointerType: { value: 'mouse' },
    });
    fireEvent(window, pointerMove);
    expect(document.documentElement.style.getPropertyValue('--spotlight-x')).toBe('320px');
    expect(document.documentElement.style.getPropertyValue('--spotlight-y')).toBe('480px');
  });

  it('updates retention, capture categories, privacy pause, and source details', async () => {
    const user = userEvent.setup();
    render(<Options />);
    await screen.findByText('Storage overview');

    await user.selectOptions(screen.getByLabelText('Automatic cleanup'), '30');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { retentionDays: 30 } });

    await user.click(screen.getByText('Complete web addresses').closest('label')!);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { captureTypes: ['text', 'code'] } });

    await user.click(screen.getByRole('checkbox', { name: /Website source/ }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { captureSourceUrl: false } });

    await user.click(screen.getByRole('button', { name: 'Pause capture' }));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_SETTINGS',
      payload: expect.objectContaining({ capturePaused: true, capturePausedUntil: expect.any(Number) }),
    }));
    expect(screen.getByText('Approx. usage')).toBeInTheDocument();
  });
});
