import { describe, expect, it } from 'vitest';
import { captureIsAuthorized } from './capturePermissions';
import type { Settings } from './types';

const settings: Settings = {
  autoCapture: true,
  historyLimit: 500,
  excludedSites: [],
  captureConsentVersion: 1,
  captureConsentAt: 123,
};

describe('capture authorization', () => {
  it('requires access, an enabled setting, and current affirmative consent', () => {
    expect(captureIsAuthorized(settings, true)).toBe(true);
    expect(captureIsAuthorized(settings, false)).toBe(false);
    expect(captureIsAuthorized({ ...settings, autoCapture: false }, true)).toBe(false);
    expect(captureIsAuthorized({ ...settings, captureConsentVersion: 0 }, true)).toBe(false);
    expect(captureIsAuthorized({ ...settings, captureConsentAt: undefined }, true)).toBe(false);
  });
});
