import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../lib/runtime';
import { Options } from './Options';
vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));
const state = { version: 2 as const, clips: [], settings: { autoCapture: true, historyLimit: 500, excludedSites: [] } };
describe('options', () => { beforeEach(() => { vi.mocked(sendMessage).mockResolvedValue({ ok: true, state }); vi.stubGlobal('confirm', vi.fn(() => true)); }); it('updates settings and clears history', async () => { const user = userEvent.setup(); render(<Options />); await screen.findByText('Automatic web capture'); await user.click(screen.getByRole('checkbox')); expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { autoCapture: false } }); await user.selectOptions(screen.getByLabelText('History limit'), '250'); expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { historyLimit: 250 } }); await user.click(screen.getByRole('button', { name: 'Clear history' })); expect(sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' }); }); });
