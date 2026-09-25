import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../lib/clips';
import type { StorageState } from '../lib/types';
import { sendMessage } from '../lib/runtime';
import { Popup } from './Popup';

vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));

const state: StorageState = {
  version: 2,
  settings: { ...DEFAULT_SETTINGS, autoCapture: true, captureConsentVersion: 1, captureConsentAt: 1 },
  clips: [
    { id: 'recent', type: 'text', content: 'Recent note', title: 'A misleading page title', sourceUrl: 'https://www.google.com/search?q=recent', sourceApp: 'Google Chrome', favorite: false, createdAt: 2, updatedAt: 2 },
    { id: 'favorite', type: 'url', content: 'https://example.com', title: 'Example home', sourceUrl: 'https://chatgpt.com/c/example', sourceApp: 'Google Chrome', favorite: true, createdAt: 1, updatedAt: 1 },
    { id: 'code', type: 'code', content: 'const answer = 42;', favorite: false, createdAt: 0, updatedAt: 0 },
    { id: 'snippet', type: 'text', content: 'Hello {{name}}, your project is {{project|Clipboard+}}.', favorite: false, createdAt: 0, updatedAt: 0 },
  ],
};

const mockedSend = vi.mocked(sendMessage);
beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue({ ok: true, state });
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://current.test', title: 'Current tab' }]),
      sendMessage: vi.fn().mockResolvedValue({ ready: true, settingsLoaded: true, enabled: true, paused: false, excluded: false }),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
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

    await user.click(screen.getByRole('button', { name: /copy url clip: https:\/\/example\.com/i }));
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

  it('focuses search on open and moves through visible rows with the arrow keys', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    const search = await screen.findByRole('textbox', { name: 'Search clips' });
    expect(search).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    const favoriteRow = screen.getByRole('button', { name: /copy url clip: https:\/\/example\.com/i });
    expect(favoriteRow).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    const recentRow = screen.getByRole('button', { name: /copy text clip: recent note/i });
    expect(recentRow).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: /copy text clip: hello \{\{name\}\}/i })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(favoriteRow).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(search).toHaveFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(clipboardWrite).toHaveBeenCalledWith('Recent note');
  });

  it('adds manual clips and saves the active tab', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    await user.click(screen.getByRole('button', { name: /add clip/i }));
    await user.type(screen.getByLabelText(/Paste or type anything/), 'A new clip');
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

  it('offers an undo notice after deleting a clip and restores it on request', async () => {
    const user = userEvent.setup();
    const remaining: StorageState = { ...state, clips: state.clips.filter((clip) => clip.id !== 'recent') };
    mockedSend.mockImplementation(async (message) => {
      if (message.type === 'DELETE_CLIP') {
        return { ok: true, state: remaining, undo: { token: 'token-1', expiresAt: Date.now() + 8_000 } };
      }
      return { ok: true, state };
    });
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Clip deleted.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mockedSend).toHaveBeenCalledWith({ type: 'RESTORE_DELETED_CLIP', payload: { token: 'token-1' } });
    expect(await screen.findByText('Clip restored')).toBeInTheDocument();
  });

  it('keeps deletion feedback available when the service worker declines an undo offer', async () => {
    const user = userEvent.setup();
    mockedSend.mockImplementation(async (message) => (
      message.type === 'DELETE_CLIP'
        ? { ok: true, state: { ...state, clips: [] } }
        : { ok: true, state }
    ));
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('Clip deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('fills smart snippet fields before copying the rendered result', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    await screen.findByText('Hello {{name}}, your project is {{project|Clipboard+}}.');

    await user.click(screen.getByRole('button', { name: /copy text clip: hello \{\{name\}\}/i }));
    expect(screen.getByRole('dialog', { name: 'Fill in the fields' })).toBeInTheDocument();
    expect(screen.getByLabelText('project')).toHaveValue('Clipboard+');
    await user.type(screen.getByLabelText('name'), 'Tony');
    await user.click(screen.getByRole('button', { name: 'Copy snippet' }));

    expect(clipboardWrite).toHaveBeenCalledWith('Hello Tony, your project is Clipboard+.');
    expect(await screen.findByText('Snippet copied')).toBeInTheDocument();
  });

  it('previews a clip in a read-only dialog, keeping the exact stored content', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    const long = 'first line\n\n\tindented line\n   trailing spaces   \nlast line';
    mockedSend.mockResolvedValue({
      ok: true,
      state: { ...state, clips: [{ id: 'long', type: 'code', content: long, favorite: false, createdAt: 1, updatedAt: 1 }] },
    });
    render(<Popup />);
    await screen.findByText('first line', { exact: false });
    const card = screen.getByText(/first line/).closest('article')!;

    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));

    const dialog = screen.getByRole('dialog', { name: 'Code clip' });
    const body = within(dialog).getByLabelText('Clip content');
    expect(body.tagName).toBe('PRE');
    expect(body.textContent).toBe(long);
    expect(within(dialog).getByText('Characters')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(clipboardWrite).toHaveBeenCalledWith(long);
    expect(screen.queryByRole('dialog', { name: 'Code clip' })).not.toBeInTheDocument();
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('copies a snippet original from the row menu without filling fields', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    await screen.findByText(/Hello \{\{name\}\}/);
    const card = screen.getByText(/Hello \{\{name\}\}/).closest('article')!;

    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy original' }));

    expect(clipboardWrite).toHaveBeenCalledWith('Hello {{name}}, your project is {{project|Clipboard+}}.');
    expect(screen.queryByRole('dialog', { name: 'Fill in the fields' })).not.toBeInTheDocument();
    expect(await screen.findByText('Original copied')).toBeInTheDocument();
    expect(await screen.findByText('Original copied to clipboard')).toBeInTheDocument();
  });

  it('copies a snippet original from the preview and routes plain copy into the fill-in workflow', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    await screen.findByText(/Hello \{\{name\}\}/);
    const card = screen.getByText(/Hello \{\{name\}\}/).closest('article')!;

    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Text clip' });
    await user.click(within(dialog).getByRole('button', { name: 'Copy original' }));
    expect(clipboardWrite).toHaveBeenCalledWith('Hello {{name}}, your project is {{project|Clipboard+}}.');

    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Text clip' })).getByRole('button', { name: 'Fill fields' }));
    expect(screen.getByRole('dialog', { name: 'Fill in the fields' })).toBeInTheDocument();
  });

  it('previews and copies a transformation without changing the saved clip', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Transform & copy' }));
    expect(screen.getByRole('dialog', { name: 'Transform and copy' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /uppercase/i }));
    expect(screen.getByLabelText('Transformation preview')).toHaveTextContent('RECENT NOTE');
    await user.click(screen.getByRole('button', { name: 'Copy result' }));

    expect(clipboardWrite).toHaveBeenCalledWith('RECENT NOTE');
    expect(screen.getByText('Recent note')).toBeInTheDocument();
    expect(await screen.findByText('Transformed copy ready')).toBeInTheDocument();
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

  it('navigates the clip menu with arrows, Home, End, and Escape', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;
    const trigger = within(recentCard).getByRole('button', { name: 'Clip actions' });

    await user.click(trigger);
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(items[items.length - 1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(items[items.length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps a single clip menu open at a time', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;
    const codeCard = screen.getByText('const answer = 42;').closest('article')!;

    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);

    await user.click(within(codeCard).getByRole('button', { name: 'Clip actions' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(within(codeCard).getByRole('menu')).toBeInTheDocument();
    expect(within(recentCard).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('traps focus in a dialog, closes on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;
    const trigger = within(recentCard).getByRole('button', { name: 'Clip actions' });

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));

    const dialog = screen.getByRole('dialog', { name: 'Text clip' });
    expect(within(dialog).getByLabelText('Clip content')).toHaveFocus();

    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marks the popup background inert only while a dialog is open', async () => {
    const user = userEvent.setup();
    const { container } = render(<Popup />);
    await screen.findByText('Recent note');
    const content = () => container.querySelector('.popup-content');
    expect(content()).not.toHaveAttribute('inert');

    const recentCard = screen.getByText('Recent note').closest('article')!;
    await user.click(within(recentCard).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));
    expect(content()).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    expect(content()).not.toHaveAttribute('inert');
  });

  it('announces ordinary copy success in a polite live region', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    await user.click(screen.getByRole('button', { name: /copy text clip: recent note/i }));
    const announcement = await screen.findByText('Copied to clipboard');
    expect(announcement).toHaveAttribute('role', 'status');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps a concise accessible label instead of the whole clip', async () => {
    const user = userEvent.setup();
    const long = 'x'.repeat(50_000);
    mockedSend.mockResolvedValue({
      ok: true,
      state: { ...state, clips: [{ id: 'huge', type: 'text', content: long, favorite: false, createdAt: 1, updatedAt: 1 }] },
    });
    render(<Popup />);
    const row = await screen.findByRole('button', { name: /^Copy text clip:/ });
    expect(row.getAttribute('aria-label')!.length).toBeLessThan(140);
    await user.click(row);
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenLastCalledWith(long);
  });

  it('moves focus to the nearest surviving row after a keyboard deletion', async () => {
    const user = userEvent.setup();
    const remaining: StorageState = { ...state, clips: state.clips.filter((clip) => clip.id !== 'recent') };
    mockedSend.mockImplementation(async (message) => (
      message.type === 'DELETE_CLIP'
        ? { ok: true, state: remaining, undo: { token: 'token-1', expiresAt: Date.now() + 8_000 } }
        : { ok: true, state }
    ));
    render(<Popup />);
    await screen.findByText('Recent note');
    const card = screen.getByText('Recent note').closest('article')!;

    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => expect(document.activeElement?.hasAttribute('data-clip-row')).toBe(true));
    expect(screen.queryByText('Recent note')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalled();
  });

  it('returns focus to search when the last row is deleted', async () => {
    const user = userEvent.setup();
    const single: StorageState = {
      ...state,
      clips: [{ id: 'only', type: 'text', content: 'Only clip', favorite: false, createdAt: 1, updatedAt: 1 }],
    };
    mockedSend.mockImplementation(async (message) => (
      message.type === 'DELETE_CLIP' ? { ok: true, state: { ...single, clips: [] } } : { ok: true, state: single }
    ));
    render(<Popup />);
    await screen.findByText('Only clip');
    const card = screen.getByText('Only clip').closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search clips' })).toHaveFocus());
  });

  it('exits the clip menu with Tab and Shift+Tab instead of dropping focus', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText('Recent note');
    const recentCard = screen.getByText('Recent note').closest('article')!;
    const codeCard = screen.getByText('const answer = 42;').closest('article')!;
    const trigger = within(recentCard).getByRole('button', { name: 'Clip actions' });

    await user.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(within(codeCard).getByRole('button', { name: /copy code clip: const answer/i })).toHaveFocus());

    await user.click(within(codeCard).getByRole('button', { name: 'Clip actions' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(within(codeCard).getByRole('button', { name: /copy code clip: const answer/i })).toHaveFocus());
  });

  it('returns focus to the original trigger after a dialog hands off to another dialog', async () => {
    const user = userEvent.setup();
    render(<Popup />);
    await screen.findByText(/Hello \{\{name\}\}/);
    const card = screen.getByText(/Hello \{\{name\}\}/).closest('article')!;
    const trigger = within(card).getByRole('button', { name: 'Clip actions' });

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Preview' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fill fields' }));
    expect(screen.getByRole('dialog', { name: 'Fill in the fields' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('keeps the undo notice inside the inert background so dialogs own interaction', async () => {
    const user = userEvent.setup();
    mockedSend.mockImplementation(async (message) => (
      message.type === 'DELETE_CLIP'
        ? { ok: true, state: { ...state, clips: state.clips.filter((clip) => clip.id !== 'recent') }, undo: { token: 'token-1', expiresAt: Date.now() + 8_000 } }
        : { ok: true, state }
    ));
    const { container } = render(<Popup />);
    await screen.findByText('Recent note');
    const card = screen.getByText('Recent note').closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Clip actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await screen.findByText('Clip deleted.');

    const content = container.querySelector('.popup-content')!;
    expect(content.querySelector('.undo-bar')).not.toBeNull();
    expect(content.contains(screen.getByRole('button', { name: 'Undo' }))).toBe(true);
  });

  it('replaces an endless spinner with a bounded load error and a working retry', async () => {
    const user = userEvent.setup();
    mockedSend.mockRejectedValueOnce(new Error('Clipboard+ background service is unavailable.'));
    render(<Popup />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard+ could not load your clips');
    expect(screen.getByText('Clipboard+ background service is unavailable.')).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Retry loading clips' });
    await user.click(retry);
    expect(await screen.findByText('Recent note')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('times out a hung load, and a late response cannot overwrite a newer refresh', async () => {
    vi.useFakeTimers();
    try {
      let resolveHungLoad: (value: { ok: boolean; state: StorageState }) => void = () => {};
      mockedSend.mockImplementationOnce(() => new Promise((resolve) => { resolveHungLoad = resolve; }));
      render(<Popup />);
      expect(screen.getByText('Loading your clips')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4_100);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('did not respond in time');

      mockedSend.mockResolvedValue({ ok: true, state });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry loading clips' }));
      });
      expect(screen.getByText('Recent note')).toBeInTheDocument();

      // The abandoned first request resolving later must not clobber the newer state.
      await act(async () => {
        resolveHungLoad({ ok: true, state: { ...state, clips: [] } });
      });
      expect(screen.getByText('Recent note')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps live storage updates when an older initial snapshot finally resolves', async () => {
    let resolveLoad: (value: { ok: boolean; state: StorageState }) => void = () => {};
    mockedSend.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    render(<Popup />);
    const onStorage = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    await act(async () => {
      onStorage({ [STORAGE_KEY]: { newValue: state } }, 'local');
    });
    expect(screen.getByText('Recent note')).toBeInTheDocument();
    await act(async () => { resolveLoad({ ok: true, state: { ...state, clips: [] } }); });
    expect(screen.getByText('Recent note')).toBeInTheDocument();
  });

  it('shows a recovery action when optional website access is absent', async () => {
    (chrome.permissions.contains as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    render(<Popup />);
    expect(await screen.findByText('Website access is off, so copies on websites are not saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Capture Controls' })).toBeInTheDocument();
  });

  it('offers a one-hour privacy pause from the popup header', async () => {
    const user = userEvent.setup();
    const paused: StorageState = {
      ...state,
      settings: { ...state.settings, capturePaused: true, capturePausedUntil: Date.now() + 3_600_000 },
    };
    mockedSend.mockImplementation(async (message) => (
      message.type === 'UPDATE_SETTINGS' ? { ok: true, state: paused } : { ok: true, state }
    ));
    render(<Popup />);
    await user.click(await screen.findByRole('button', { name: 'Pause automatic web capture for one hour' }));
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_SETTINGS',
      payload: expect.objectContaining({ capturePaused: true, capturePausedUntil: expect.any(Number) }),
    }));
    expect(await screen.findByText(/Automatic website capture is paused until/)).toBeInTheDocument();
  });

  it('clears a timed pause by itself when it expires, without a manual resume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    try {
      const paused: StorageState = {
        ...state,
        settings: { ...state.settings, capturePaused: true, capturePausedUntil: Date.now() + 100 },
      };
      mockedSend.mockResolvedValue({ ok: true, state: paused });
      render(<Popup />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText(/Automatic website capture is paused until/)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByText(/Automatic website capture is paused/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pause automatic web capture for one hour' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('checks the page before reporting capture as active', async () => {
    render(<Popup />);
    expect(screen.getByText(/Checking whether this page can be captured/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Checking whether this page can be captured/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open Capture Controls' })).not.toBeInTheDocument();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'PING_CAPTURE' });
  });

  it('reports browser-owned pages as restricted without probing the listener', async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 7, url: 'chrome://extensions' }]);
    render(<Popup />);
    expect(await screen.findByText('This browser page cannot be captured. Try a normal website.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Capture Controls' })).not.toBeInTheDocument();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps an excluded site excluded even while capture is paused', async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 3, url: 'https://excluded.example/page' }]);
    mockedSend.mockResolvedValue({
      ok: true,
      state: {
        ...state,
        settings: { ...state.settings, capturePaused: true, capturePausedUntil: Date.now() + 600_000, excludedSites: ['excluded.example'] },
      },
    });
    render(<Popup />);
    expect(await screen.findByText('This site is excluded in Clipboard+ settings.')).toBeInTheDocument();
    // Resume stays reachable on an excluded page instead of being replaced by an active claim.
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('keeps Resume reachable on a restricted browser page while paused', async () => {
    const user = userEvent.setup();
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 9, url: 'chrome://settings' }]);
    const paused: StorageState = {
      ...state,
      settings: { ...state.settings, capturePaused: true, capturePausedUntil: Date.now() + 600_000 },
    };
    mockedSend.mockImplementation(async (message) => (
      message.type === 'UPDATE_SETTINGS' ? { ok: true, state } : { ok: true, state: paused }
    ));
    render(<Popup />);
    expect(await screen.findByText('This browser page cannot be captured. Try a normal website.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(mockedSend).toHaveBeenCalledWith({
      type: 'UPDATE_SETTINGS',
      payload: { capturePaused: false, capturePausedUntil: null },
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument());
    expect(screen.getByText('This browser page cannot be captured. Try a normal website.')).toBeInTheDocument();
  });

  it('never probes or reinjects the listener while capture is unauthorized', async () => {
    mockedSend.mockResolvedValue({
      ok: true,
      state: { ...state, settings: { ...state.settings, autoCapture: false } },
    });
    render(<Popup />);
    expect(await screen.findByText('Automatic website capture is off.')).toBeInTheDocument();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('treats an unstructured listener reply as unavailable instead of ready', async () => {
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.scripting.executeScript as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<Popup />);
    expect(await screen.findByText('Clipboard+ could not reach the capture listener on this page.')).toBeInTheDocument();
  });

  it('stays in checking while the listener is still loading its settings, then settles', async () => {
    const sendPing = chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
    let settingsLoaded = false;
    sendPing.mockImplementation(async () => ({ ready: true, settingsLoaded, enabled: settingsLoaded, paused: false, excluded: false }));
    render(<Popup />);
    expect(await screen.findByText(/Checking whether this page can be captured/)).toBeInTheDocument();

    settingsLoaded = true;
    await waitFor(() => expect(screen.queryByText(/Checking whether this page can be captured/)).not.toBeInTheDocument(), { timeout: 3_000 });
    expect(screen.queryByText('Clipboard+ could not reach the capture listener on this page.')).not.toBeInTheDocument();
  });

  it('bounds listener loading retries and allows a fresh manual retry', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({ ready: true, settingsLoaded: false });
      render(<Popup />);
      await act(async () => { await Promise.resolve(); });
      for (let index = 0; index < 6; index += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      }
      expect(screen.getByText('Clipboard+ could not reach the capture listener on this page.')).toBeInTheDocument();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
      expect(screen.getByText(/Checking whether this page can be captured/)).toBeInTheDocument();
      vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({ ready: true, settingsLoaded: true, enabled: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(screen.queryByText(/Checking whether this page can be captured/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses listener exclusions when Chrome withholds the tab address', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 } as chrome.tabs.Tab]);
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({ ready: true, settingsLoaded: true, enabled: true, excluded: true });
    render(<Popup />);
    expect(await screen.findByText('This site is excluded in Clipboard+ settings.')).toBeInTheDocument();
  });

  it('does not report a disabled listener as ready', async () => {
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({ ready: true, settingsLoaded: true, enabled: false });
    render(<Popup />);
    expect(await screen.findByText('Clipboard+ could not reach the capture listener on this page.')).toBeInTheDocument();
  });

  it('rechecks the capture state when the active tab navigates', async () => {
    render(<Popup />);
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(1));
    const listeners = (chrome.tabs.onUpdated.addListener as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(listeners).toHaveLength(1);
    (listeners[0][0] as (tabId: number, changeInfo: { url?: string }) => void)(1, { url: 'https://moved.example/' });
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(2));
  });

  it('surfaces an unreachable listener with a retry action', async () => {
    const user = userEvent.setup();
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no listener'));
    (chrome.scripting.executeScript as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no listener'));
    render(<Popup />);

    expect(await screen.findByText('Clipboard+ could not reach the capture listener on this page.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(2));
  });

  it('rechecks the capture state when the active tab changes', async () => {
    render(<Popup />);
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(1));
    const listeners = (chrome.tabs.onActivated.addListener as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(listeners).toHaveLength(1);
    (listeners[0][0] as () => void)();
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(2));
  });
});
