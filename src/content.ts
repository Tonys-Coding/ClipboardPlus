import { STORAGE_KEY, isHostExcluded, migrateState, normalizeContent } from './lib/clips';
import type { Settings } from './lib/types';

const SENSITIVE_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year']);

function inputIsSensitive(element: Element | null): boolean {
  if (!element) return false;
  const input = element.closest('input, textarea');
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
  if (input instanceof HTMLInputElement && input.type.toLowerCase() === 'password') return true;
  return input.autocomplete.toLowerCase().split(/\s+/).some((token) => SENSITIVE_AUTOCOMPLETE.has(token));
}

function selectedText(event: ClipboardEvent): string {
  const clipboardText = event.clipboardData?.getData('text/plain') ?? '';
  if (clipboardText) return clipboardText;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
  return window.getSelection()?.toString() ?? '';
}

let settings: Settings | null = null;
void chrome.storage.local.get(STORAGE_KEY).then((stored) => { settings = migrateState(stored[STORAGE_KEY]).settings; });
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) settings = migrateState(changes[STORAGE_KEY].newValue).settings;
});
document.addEventListener('copy', (event) => {
  if (!settings?.autoCapture || isHostExcluded(location.hostname, settings.excludedSites)) return;
  const target = event.target instanceof Element ? event.target : document.activeElement;
  if (inputIsSensitive(target)) return;
  const content = normalizeContent(selectedText(event));
  if (!content) return;
  void chrome.runtime.sendMessage({ type: 'ADD_CLIP', payload: { content, title: document.title || undefined, sourceUrl: location.href } });
});
