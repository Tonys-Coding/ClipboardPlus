import { act, render, screen } from '@testing-library/react';
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state, permissions: { websiteAccess: true } });
    vi.stubGlobal('chrome', {
      permissions: {
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
        contains: vi.fn().mockResolvedValue(true),
        onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { getManifest: vi.fn(() => ({ version: '1.8.3' })) },
      commands: { getAll: vi.fn().mockResolvedValue([{ name: '_execute_action', shortcut: 'Alt+Shift+C' }]) },
      scripting: { getRegisteredContentScripts: vi.fn().mockResolvedValue([]) },
      tabs: { create: vi.fn().mockResolvedValue(undefined) },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
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

    await user.selectOptions(screen.getByLabelText('Appearance'), 'dark');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { theme: 'dark' } });

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

  it('refreshes listener registration after enabling capture completes', async () => {
    const user = userEvent.setup();
    const disabled = { ...state, settings: { ...state.settings, autoCapture: false } };
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message.type === 'UPDATE_SETTINGS') {
        (chrome.scripting.getRegisteredContentScripts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'clipboard-plus-web-capture', matches: ['https://*/*'] }]);
        return { ok: true, state };
      }
      return { ok: true, state: disabled };
    });
    render(<Options />);
    await screen.findByText(/Capture listener registered: no/);
    await user.click(screen.getByRole('checkbox', { name: 'Automatic web capture' }));
    expect(await screen.findByText(/Capture listener registered: yes/)).toBeInTheDocument();
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

  it('uses a consistent set of capture icons without a cursor spotlight', async () => {
    const { container } = render(<Options />);
    await screen.findByText('Automatic web capture');

    expect(container.querySelectorAll('img[src="/assets/clipboard-plus-single.png"]')).toHaveLength(6);
    expect(container.querySelector('.spotlight-stage')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.capture-type-option .capture-type-icon')).toHaveLength(3);
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

  it('shows the runtime version, the current shortcut, and shortcut settings instructions', async () => {
    const user = userEvent.setup();
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');
    expect(await screen.findByText('Press Alt+Shift+C to open Clipboard+ and focus search.')).toBeInTheDocument();
    expect(screen.getByText(/browser-only shortcut works while Chrome is in front/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Manage shortcuts' }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    expect(screen.getByRole('link', { name: 'Release notes' })).toHaveAttribute(
      'href',
      'https://tonys-coding.github.io/ClipboardPlus/release-notes.html',
    );
  });

  it('explains capture limits when no shortcut has been assigned', async () => {
    (chrome.commands.getAll as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: '_execute_action', shortcut: '' }]);
    render(<Options />);
    expect(await screen.findByText(/No shortcut is currently assigned/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome Web Store, and other browser-owned pages never expose copy events/)).toBeInTheDocument();
  });

  it('copies a redacted troubleshooting report and never includes clip data', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    vi.mocked(sendMessage).mockResolvedValue({
      ok: true,
      state: {
        ...state,
        clips: [{ id: 'secret-id', type: 'text', content: 'SEKRIT clip body', favorite: false, createdAt: 1, updatedAt: 1 }],
        settings: { ...state.settings, excludedSites: ['private.example'] },
      },
      permissions: { websiteAccess: true },
    });
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));

    const report = clipboardWrite.mock.calls.at(-1)?.[0] ?? '';
    expect(report).toContain('Clipboard+ troubleshooting details');
    expect(report).toContain('Version: 1.8.3');
    expect(report).toMatch(/Build profile: (?:development|store)/);
    expect(report).toContain('Capture listener registered: no');
    expect(report).not.toContain('SEKRIT');
    expect(report).not.toContain('private.example');
    expect(report).not.toContain('secret-id');
    expect(report).not.toContain('Total clips');
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('reports a failed troubleshooting copy instead of staying silent', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'));
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));
    expect(await screen.findByText(/Clipboard access was blocked/, { selector: '.diagnostics-feedback' })).toBeInTheDocument();
  });

  it('re-reads the live status when capture changes elsewhere on the page or in Chrome', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state, permissions: { websiteAccess: true } });
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    // Capture is enabled elsewhere: storage and permission events must refresh the About status.
    vi.mocked(sendMessage).mockResolvedValue({
      ok: true,
      state: { ...state, settings: { ...state.settings, autoCapture: true, captureConsentVersion: 1, captureConsentAt: 1 } },
      permissions: { websiteAccess: true },
    });
    (chrome.scripting.getRegisteredContentScripts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'clipboard-plus-web-capture' }]);
    const storageListener = (chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;
    await act(async () => {
      storageListener({ clipboardPlus: { newValue: state } }, 'local');
    });

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));
    const report = clipboardWrite.mock.calls.at(-1)?.[0] ?? '';
    expect(report).toContain('Capture enabled: yes');
    expect(report).toContain('Consent current: yes');
    expect(report).toContain('Website access granted: yes');
    expect(report).toContain('Capture listener registered: yes');
  });

  it('refreshes the shortcut after returning from Chrome shortcut settings', async () => {
    render(<Options />);
    expect(await screen.findByText('Press Alt+Shift+C to open Clipboard+ and focus search.')).toBeInTheDocument();

    (chrome.commands.getAll as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: '_execute_action', shortcut: 'Ctrl+Shift+9' }]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText('Press Ctrl+Shift+9 to open Clipboard+ and focus search.')).toBeInTheDocument();
  });

  it('reports consent as not current when the disclosure timestamp is missing', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    vi.mocked(sendMessage).mockResolvedValue({
      ok: true,
      state: { ...state, settings: { ...state.settings, autoCapture: true, captureConsentVersion: 1, captureConsentAt: undefined } },
      permissions: { websiteAccess: true },
    });
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));
    const report = clipboardWrite.mock.calls.at(-1)?.[0] ?? '';
    expect(report).toContain('Consent current: no');
  });

  it('shows unknown and copies nothing when the live status cannot be read', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    vi.mocked(sendMessage).mockRejectedValue(new Error('Clipboard+ background service is unavailable.'));
    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));

    expect(await screen.findByText(/Clipboard\+ background service is unavailable/, { selector: '.diagnostics-feedback' })).toBeInTheDocument();
    expect(clipboardWrite).not.toHaveBeenCalled();
  });

  it('announces diagnostics feedback through a polite live region', async () => {
    const user = userEvent.setup();
    render(<Options />);
    await screen.findByText('Clipboard+ 1.8.3');

    await user.click(screen.getByRole('button', { name: 'Copy troubleshooting details' }));
    const liveRegion = await screen.findByText('Troubleshooting details copied to your clipboard.');
    expect(liveRegion).toHaveAttribute('role', 'status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });
});
