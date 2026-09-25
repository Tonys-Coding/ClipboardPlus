import { captureIsAuthorized } from './capturePermissions';
import { captureIsPaused, isHostExcluded } from './clips';
import type { Settings } from './types';

export type CaptureStatus =
  | 'checking'
  | 'active'
  | 'paused'
  | 'disabled'
  | 'permission'
  | 'excluded'
  | 'restricted'
  | 'unavailable';

export type ListenerHealth = 'ready' | 'loading' | 'unavailable' | 'excluded' | 'paused';

const RESTRICTED_PROTOCOLS = [
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'chrome-search:',
  'devtools:',
  'edge:',
  'brave:',
  'opera:',
  'vivaldi:',
  'about:',
  'view-source:',
  'file:',
  'data:',
  'blob:',
  'javascript:',
];

const WEB_STORE_HOSTS = new Set(['chromewebstore.google.com']);

/**
 * Browser-owned pages Chrome never exposes to extensions, including the Chrome Web Store.
 * An empty or unknown address is not restricted; it simply has not been classified yet.
 */
export function isRestrictedPage(url: string): boolean {
  if (!url) return false;
  if (RESTRICTED_PROTOCOLS.some((protocol) => url.toLowerCase().startsWith(protocol))) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (WEB_STORE_HOSTS.has(parsed.hostname)) return true;
  return parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore');
}

interface CaptureStatusInput {
  url: string;
  settings: Settings;
  hasWebsiteAccess: boolean;
  listener: ListenerHealth;
  now?: number;
}

/**
 * A known browser-restricted page wins over every other state so it is never reported as
 * active, and an excluded site is reported as excluded rather than merely paused. When the
 * active tab's address is unavailable, the permission and listener checks decide instead of
 * guessing that the page is restricted.
 */
export function resolveCaptureStatus({
  url,
  settings,
  hasWebsiteAccess,
  listener,
  now = Date.now(),
}: CaptureStatusInput): CaptureStatus {
  const hasAddress = typeof url === 'string' && url.length > 0;
  if (hasAddress && isRestrictedPage(url)) return 'restricted';
  if (!hasWebsiteAccess) return 'permission';
  if (!captureIsAuthorized(settings, hasWebsiteAccess)) return 'disabled';
  let hostname = '';
  if (hasAddress) {
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = '';
    }
  }
  if ((hostname && isHostExcluded(hostname, settings.excludedSites)) || listener === 'excluded') return 'excluded';
  if (captureIsPaused(settings, now) || listener === 'paused') return 'paused';
  if (listener === 'loading') return 'checking';
  return listener === 'ready' ? 'active' : 'unavailable';
}

export function capturePauseEndsAt(settings: Settings, now = Date.now()): number | null {
  if (!captureIsPaused(settings, now)) return null;
  return settings.capturePausedUntil;
}
