import React from 'react';
import ReactDOM from 'react-dom/client';
import { STORAGE_KEY } from '../lib/clips';
import type { StorageState } from '../lib/types';
import { Options } from './Options';

async function start() {
  try {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const state = saved[STORAGE_KEY] as Partial<StorageState> | undefined;
    document.documentElement.dataset.theme = state?.settings?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Options /></React.StrictMode>);
}

void start();
