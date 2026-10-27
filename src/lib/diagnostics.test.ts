import { describe, expect, it } from 'vitest';
import { buildTroubleshootingReport } from './diagnostics';

const snapshot = {
  manifestVersion: '1.8.3',
  buildProfile: 'store' as const,
  captureEnabled: true,
  capturePaused: false,
  consentCurrent: true,
  websiteAccessGranted: false,
  captureListenerRegistered: false,
};

describe('troubleshooting report', () => {
  it('reports only the allowlisted troubleshooting fields', () => {
    expect(buildTroubleshootingReport(snapshot)).toBe([
      'Clipboard+ troubleshooting details',
      'Product: Clipboard+',
      'Version: 1.8.3',
      'Build profile: store',
      'Capture enabled: yes',
      'Capture paused: no',
      'Consent current: yes',
      'Website access granted: no',
      'Capture listener registered: no',
      'This checklist was generated locally. It contains no clip contents, page addresses, or identifiers.',
    ].join('\n'));
  });

  it('never emits clip content, domains, urls, or identifiers', () => {
    const report = buildTroubleshootingReport(snapshot);
    const forbidden = [
      'https://',
      'http://',
      'example.com',
      'SEKRIT',
      'clip count',
      'google.com',
      '1abc-uuid',
    ];
    for (const value of forbidden) expect(report).not.toContain(value);
    expect(report.split('\n')).toHaveLength(10);
  });

  it('marks an unavailable registration check as unknown instead of inferring a value', () => {
    const report = buildTroubleshootingReport({ ...snapshot, captureListenerRegistered: null });
    expect(report).toContain('Capture listener registered: unknown');
  });
});
