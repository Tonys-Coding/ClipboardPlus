import { CAPTURE_CONSENT_VERSION } from './clips';
import type { Settings } from './types';

export const CAPTURE_ORIGINS = ['http://*/*', 'https://*/*'];

export function captureIsAuthorized(settings: Settings, websiteAccess: boolean): boolean {
  return websiteAccess
    && settings.autoCapture
    && settings.captureConsentVersion >= CAPTURE_CONSENT_VERSION
    && typeof settings.captureConsentAt === 'number';
}

export async function hasWebsiteAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: CAPTURE_ORIGINS });
}

export async function requestWebsiteAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: CAPTURE_ORIGINS });
}

export async function removeWebsiteAccess(): Promise<boolean> {
  return chrome.permissions.remove({ origins: CAPTURE_ORIGINS });
}
