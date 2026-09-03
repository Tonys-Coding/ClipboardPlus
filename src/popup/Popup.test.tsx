import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../lib/runtime';
import type { StorageState } from '../lib/types';
import { Popup } from './Popup';

vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));
const state: StorageState = { version: 1, settings: { autoCapture: true, historyLimit: 500, excludedSites: [] }, clips: [{ id: 'recent', type: 'text', content: 'Recent note', favorite: false, createdAt: 2, updatedAt: 2 }, { id: 'favorite', type: 'url', content: 'https://example.com', title: 'Example home', favorite: true, createdAt: 1, updatedAt: 1 }] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(sendMessage).mockResolvedValue({ ok: true, state }); vi.stubGlobal('chrome', { tabs: { query: vi.fn().mockResolvedValue([{ url: 'https://current.test', title: 'Current tab' }]) }, runtime: { openOptionsPage: vi.fn() }, storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } }); });
describe('popup', () => {
  it('searches and copies clips', async () => { const user = userEvent.setup(); const write = vi.spyOn(navigator.clipboard, 'writeText'); render(<Popup />); expect(await screen.findByText('Favorites')).toBeInTheDocument(); await user.click(screen.getByRole('button', { name: /copy example home/i })); expect(write).toHaveBeenCalledWith('https://example.com'); await user.type(screen.getByRole('textbox', { name: 'Search clips' }), 'note'); expect(screen.queryByText('Example home')).not.toBeInTheDocument(); });
  it('adds a manual clip and saves the active tab', async () => { const user = userEvent.setup(); render(<Popup />); await screen.findByText('Recent note'); await user.click(screen.getByRole('button', { name: /add clip/i })); await user.type(screen.getByLabelText('Paste or type anything'), 'New clip'); await user.click(screen.getByRole('button', { name: /save clip/i })); expect(sendMessage).toHaveBeenCalledWith({ type: 'ADD_CLIP', payload: { content: 'New clip' } }); await user.click(screen.getByRole('button', { name: /save tab/i })); expect(sendMessage).toHaveBeenCalledWith({ type: 'ADD_CLIP', payload: { content: 'https://current.test', title: 'Current tab', sourceUrl: 'https://current.test' } }); });
});
