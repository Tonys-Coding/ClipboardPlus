import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../lib/runtime';
import type { StorageState } from '../lib/types';
import { Options } from './Options';

vi.mock('../lib/runtime', () => ({ sendMessage: vi.fn() }));

const state: StorageState = {
  version: 2,
  clips: [],
  settings: { autoCapture: true, historyLimit: 500, excludedSites: [] },
};

describe('Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, state });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('updates capture, history limit, exclusions, and clear actions', async () => {
    const user = userEvent.setup();
    render(<Options />);
    await screen.findByText('Automatic web capture');
    await user.click(screen.getByRole('checkbox'));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { autoCapture: false } });

    await user.selectOptions(screen.getByLabelText('History limit'), '250');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { historyLimit: 250 } });

    await user.type(screen.getByLabelText('Site to exclude'), 'https://www.example.com/path');
    await user.click(screen.getByRole('button', { name: 'Add site' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: { excludedSites: ['example.com'] } });

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_HISTORY' });
  });
});
