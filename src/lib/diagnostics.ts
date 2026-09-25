export interface TroubleshootingSnapshot {
  manifestVersion: string;
  buildProfile: 'development' | 'store';
  captureEnabled: boolean | null;
  capturePaused: boolean | null;
  consentCurrent: boolean | null;
  websiteAccessGranted: boolean | null;
  captureListenerRegistered: boolean | null;
}

function booleanLabel(value: boolean | null): string {
  if (value === null) return 'unknown';
  return value ? 'yes' : 'no';
}

/**
 * Clipboard export only. This allowlist deliberately excludes clip text and counts,
 * page titles, URLs, excluded domains, clip ids, raw errors, and device identifiers.
 */
export function buildTroubleshootingReport(snapshot: TroubleshootingSnapshot): string {
  return [
    'Clipboard+ troubleshooting details',
    'Product: Clipboard+',
    `Version: ${snapshot.manifestVersion}`,
    `Build profile: ${snapshot.buildProfile}`,
    `Capture enabled: ${booleanLabel(snapshot.captureEnabled)}`,
    `Capture paused: ${booleanLabel(snapshot.capturePaused)}`,
    `Consent current: ${booleanLabel(snapshot.consentCurrent)}`,
    `Website access granted: ${booleanLabel(snapshot.websiteAccessGranted)}`,
    `Capture listener registered: ${booleanLabel(snapshot.captureListenerRegistered)}`,
    'This checklist was generated locally. It contains no clip contents, page addresses, or identifiers.',
  ].join('\n');
}
