import { STORAGE_KEY, isHostExcluded, migrateState, normalizeContent } from './lib/clips';
import type { Settings } from './lib/types';

const SENSITIVE_AUTOCOMPLETE = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
]);

function inputIsSensitive(element: Element | null): boolean {
  if (!element) return false;
  const input = element.closest('input, textarea');
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
  if (input instanceof HTMLInputElement && input.type.toLowerCase() === 'password') return true;
  const autocomplete = input.autocomplete.toLowerCase().split(/\s+/);
  return autocomplete.some((token) => SENSITIVE_AUTOCOMPLETE.has(token));
}

function selectedText(event: ClipboardEvent): string {
  const clipboardText = event.clipboardData?.getData('text/plain') ?? '';
  if (clipboardText) return clipboardText;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    return target.value.slice(start, end);
  }
  return window.getSelection()?.toString() ?? '';
}

function initializeCapture(): void {
  let settings: Settings | null = null;

  async function loadSettings(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      settings = migrateState(stored[STORAGE_KEY]).settings;
    } catch {
      settings = null;
    }
  }

  void loadSettings();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      settings = migrateState(changes[STORAGE_KEY].newValue).settings;
    }
  });

  chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message.type !== 'PING_CAPTURE') return;
    sendResponse({
      ready: true,
      settingsLoaded: settings !== null,
      enabled: settings?.autoCapture ?? false,
      excluded: settings ? isHostExcluded(location.hostname, settings.excludedSites) : false,
    });
  });

  document.addEventListener('copy', (event) => {
    if (!settings?.autoCapture || isHostExcluded(location.hostname, settings.excludedSites)) return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    if (inputIsSensitive(target)) return;
    const content = normalizeContent(selectedText(event));
    if (!content) return;
    void chrome.runtime.sendMessage({
      type: 'ADD_CLIP',
      payload: { content, title: document.title || undefined, sourceUrl: location.href },
    });
  });
}

const captureFlag = '__clipboardPlusCaptureLoaded';
const captureGlobal = globalThis as typeof globalThis & Record<string, unknown>;
if (!captureGlobal[captureFlag]) {
  captureGlobal[captureFlag] = true;
  initializeCapture();
}
