import { CAPTURE_CONSENT_VERSION } from './clips';
import type { Settings } from './types';

export const CAPTURE_ORIGINS = ['http://*/*', 'https://*/*'];

/** The disclosure is only current when the version and its timestamp were both recorded. */
export function hasCurrentCaptureConsent(settings: Settings): boolean {
  return settings.captureConsentVersion >= CAPTURE_CONSENT_VERSION
    && typeof settings.captureConsentAt === 'number';
}

export function captureIsAuthorized(settings: Settings, websiteAccess: boolean): boolean {
  return websiteAccess
    && settings.autoCapture
    && hasCurrentCaptureConsent(settings);
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
