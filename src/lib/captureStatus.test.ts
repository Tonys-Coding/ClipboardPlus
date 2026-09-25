import { describe, expect, it } from 'vitest';
import { isRestrictedPage, resolveCaptureStatus } from './captureStatus';
import { DEFAULT_SETTINGS } from './clips';
import type { Settings } from './types';

const authorized: Settings = {
  ...DEFAULT_SETTINGS,
  autoCapture: true,
  captureConsentVersion: 1,
  captureConsentAt: 123,
};

describe('restricted page detection', () => {
  it('covers browser-owned pages and the Chrome Web Store', () => {
    expect(isRestrictedPage('chrome://extensions')).toBe(true);
    expect(isRestrictedPage('chrome-extension://abc/popup.html')).toBe(true);
    expect(isRestrictedPage('devtools://devtools/bundled/panel.html')).toBe(true);
    expect(isRestrictedPage('about:blank')).toBe(true);
    expect(isRestrictedPage('view-source:https://example.com')).toBe(true);
    expect(isRestrictedPage('file:///tmp/notes.txt')).toBe(true);
    expect(isRestrictedPage('https://chromewebstore.google.com/detail/clipboard-plus')).toBe(true);
    expect(isRestrictedPage('https://chrome.google.com/webstore/detail/clipboard-plus')).toBe(true);
    // An address Chrome has not exposed is unknown, not automatically restricted.
    expect(isRestrictedPage('')).toBe(false);
  });

  it('allows ordinary websites', () => {
    expect(isRestrictedPage('https://example.com/page')).toBe(false);
    expect(isRestrictedPage('http://127.0.0.1:3000/')).toBe(false);
    expect(isRestrictedPage('https://chrome.google.com/something-else')).toBe(false);
  });
});

describe('capture status resolution', () => {
  const base = { url: 'https://example.com/page', settings: authorized, hasWebsiteAccess: true, listener: 'ready' as const };

  it('reports restriction ahead of every other state', () => {
    expect(resolveCaptureStatus({ ...base, url: 'https://chromewebstore.google.com/detail/x' })).toBe('restricted');
    expect(resolveCaptureStatus({ ...base, url: 'chrome://newtab', hasWebsiteAccess: false })).toBe('restricted');
  });

  it('separates missing permission from disabled capture', () => {
    expect(resolveCaptureStatus({ ...base, hasWebsiteAccess: false })).toBe('permission');
    expect(resolveCaptureStatus({ ...base, settings: { ...authorized, autoCapture: false } })).toBe('disabled');
    expect(resolveCaptureStatus({ ...base, settings: { ...authorized, captureConsentVersion: 0, captureConsentAt: undefined } })).toBe('disabled');
  });

  it('reports an excluded site instead of a pause so Resume cannot mislabel it', () => {
    const paused = { ...authorized, capturePaused: true, capturePausedUntil: null };
    expect(resolveCaptureStatus({
      ...base,
      settings: { ...paused, excludedSites: ['example.com'] },
    })).toBe('excluded');
    expect(resolveCaptureStatus({ ...base, settings: paused })).toBe('paused');
  });

  it('only reports active while the pause is genuinely over', () => {
    const timed = { ...authorized, capturePaused: true, capturePausedUntil: 5_000 };
    expect(resolveCaptureStatus({ ...base, settings: timed, now: 4_000 })).toBe('paused');
    expect(resolveCaptureStatus({ ...base, settings: timed, now: 6_000 })).toBe('active');
  });

  it('separates a missing listener from an active capture', () => {
    expect(resolveCaptureStatus({ ...base, listener: 'unavailable' })).toBe('unavailable');
    expect(resolveCaptureStatus(base)).toBe('active');
  });

  it('falls back to permission and listener checks when the address is unavailable', () => {
    expect(resolveCaptureStatus({ ...base, url: '' })).toBe('active');
    expect(resolveCaptureStatus({ ...base, url: '', listener: 'unavailable' })).toBe('unavailable');
    expect(resolveCaptureStatus({ ...base, url: '', hasWebsiteAccess: false })).toBe('permission');
    expect(resolveCaptureStatus({ ...base, url: '', settings: { ...authorized, autoCapture: false } })).toBe('disabled');
  });
});
