import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageState } from '../lib/types';
import { sendMessage } from '../lib/runtime';
import { Popup } from './Popup';

vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));

const state: StorageState = {
  version: 2,
  settings: { autoCapture: true, historyLimit: 500, excludedSites: [] },
  clips: [
    { id: 'recent', type: 'text', content: 'Recent note', title: 'A misleading page title', sourceUrl: 'https://www.google.com/search?q=recent', sourceApp: 'Google Chrome', favorite: false, createdAt: 2, updatedAt: 2 },
    { id: 'favorite', type: 'url', content: 'https://example.com', title: 'Example home', sourceUrl: 'https://chatgpt.com/c/example', sourceApp: 'Google Chrome', favorite: true, createdAt: 1, updatedAt: 1 },
    { id: 'code', type: 'code', content: 'const answer = 42;', favorite: false, createdAt: 0, updatedAt: 0 },
  ],
};

const mockedSend = vi.mocked(sendMessage);
beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue({ ok: true, state });
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://current.test', title: 'Current tab' }]),
      sendMessage: vi.fn().mockResolvedValue({ ready: true, settingsLoaded: true, enabled: true, excluded: false }),
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    runtime: { openOptionsPage: vi.fn() },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
});

describe('Clipboard+ popup', () => {
  it('shows favorites separately, searches, and copies a clip on row click', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    expect(await screen.findByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Search clips' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy https:\/\/example\.com/i }));
    expect(clipboardWrite).toHaveBeenCalledWith('https://example.com');
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    const recentCard = screen.getByText('Recent note').closest('article')!;
    expect(within(recentCard).getByText('Recent note')).toHaveClass('clip-content');
    expect(within(recentCard).getByText('google.com')).toBeInTheDocument();
    expect(within(recentCard).getByText('TEXT')).toBeInTheDocument();
    expect(within(recentCard).getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.queryByText('A misleading page title')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Search clips' }), 'Example home');
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.queryByText('Example home')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    await user.type(screen.getByRole('textbox', { name: 'Search clips' }), 'note');
    expect(screen.queryByText('Example home')).not.toBeInTheDocument();
    expect(screen.getByText('Recent note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await user.click(screen.getByRole('button', { name: 'Links' }));
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('chatgpt.com')).toBeInTheDocument();
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.queryByText('Recent note')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.queryByText('https://example.com')).not.toBeInTheDocument();
    expect(screen.getByText('Recent note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByText('const answer = 42;')).toBeInTheDocument();
    expect(screen.queryByText('Recent note')).not.toBeInTheDocument();
  });

  it('adds manual clips and saves the active tab', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    await user.click(screen.getByRole('button', { name: /add clip/i }));
    await user.type(screen.getByLabelText('Paste or type anything'), 'A new clip');
    await user.click(screen.getByRole('button', { name: /save clip/i }));
    expect(mockedSend).toHaveBeenCalledWith({ type: 'ADD_CLIP', payload: { content: 'A new clip' } });

    await user.click(screen.getByRole('button', { name: /save tab/i }));
    expect(mockedSend).toHaveBeenCalledWith({
      type: 'ADD_CLIP',
      payload: { content: 'https://current.test', title: 'Current tab', sourceUrl: 'https://current.test' },
    });
  });

  it('favorites, edits, and deletes from the overflow actions', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: /add to favorites/i }));
    expect(mockedSend).toHaveBeenCalledWith({ type: 'TOGGLE_FAVORITE', payload: { id: 'recent' } });

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const editBox = screen.getByLabelText('Content');
    await user.clear(editBox);
    await user.type(editBox, 'Edited note');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockedSend).toHaveBeenCalledWith({ type: 'UPDATE_CLIP', payload: { id: 'recent', content: 'Edited note', title: 'A misleading page title' } });

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(mockedSend).toHaveBeenCalledWith({ type: 'DELETE_CLIP', payload: { id: 'recent' } });
  });

  it('keeps action menus above other clips and flips them upward near the popup edge', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;
    const trigger = within(recentCard).getByRole('button', { name: 'Clip actions' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(450, 520, 31, 31));
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

    await user.click(trigger);

    expect(recentCard).toHaveClass('menu-open');
    expect(screen.getByRole('menu')).toHaveClass('open-up');
  });
});
