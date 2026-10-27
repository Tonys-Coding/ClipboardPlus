import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  addClip,
  detectClipType,
  filterClips,
  isHostExcluded,
  maintainState,
  migrateState,
  normalizeContent,
  normalizeHostname,
  prepareCapturedClip,
  pruneClips,
  pruneExpiredClips,
} from './clips';
import type { Clip, Settings, StorageState } from './types';

const makeClip = (id: string, favorite: boolean, updatedAt: number): Clip => ({
  id,
  type: 'text',
  content: `clip ${id}`,
  favorite,
  createdAt: updatedAt,
  updatedAt,
});

describe('clip behavior', () => {
  it('normalizes line endings and detects URLs, code, and ordinary text', () => {
    expect(normalizeContent('  hello\r\nworld  ')).toBe('hello\nworld');
    expect(detectClipType('https://example.com/path')).toBe('url');
    expect(detectClipType('const answer = items.map((item) => item.id);')).toBe('code');
    expect(detectClipType('{"name":"Clipboard+","enabled":true}')).toBe('code');
    expect(detectClipType('def greet(name):\n  return f"Hello {name}"')).toBe('code');
    expect(detectClipType('javascript:alert(1)')).toBe('text');
    expect(detectClipType('See https://example.com')).toBe('text');
    expect(detectClipType('Reminder: call John (555) 555-0100 tomorrow.')).toBe('text');
  });

  it('deduplicates content, moves it to the top, and preserves its favorite', () => {
    const existing = { ...makeClip('a', true, 1), content: 'same' };
    const state: StorageState = { ...DEFAULT_STATE, clips: [makeClip('b', false, 2), existing] };
    const result = addClip(state, { content: ' same ', title: 'Updated source' }, 50, 'unused');
    expect(result.clips.map((clip) => clip.id)).toEqual(['a', 'b']);
    expect(result.clips[0]).toMatchObject({ content: 'same', favorite: true, title: 'Updated source', updatedAt: 50 });
  });

  it('prunes only non-favorites and keeps newest history', () => {
    const clips = [makeClip('old', false, 1), makeClip('favorite', true, 2), makeClip('new', false, 3)];
    expect(pruneClips(clips, 1).map((clip) => clip.id)).toEqual(['new', 'favorite']);
  });

  it('expires old non-favorites while preserving favorites', () => {
    const day = 24 * 60 * 60 * 1000;
    const clips = [makeClip('old', false, day), makeClip('favorite', true, day), makeClip('recent', false, day * 4)];
    expect(pruneExpiredClips(clips, 1, day * 5).map((clip) => clip.id)).toEqual(['favorite', 'recent']);
    expect(pruneExpiredClips(clips, 0, day * 5)).toEqual(clips);
  });

  it('resumes an elapsed capture pause during maintenance', () => {
    const state = maintainState({
      ...DEFAULT_STATE,
      settings: { ...DEFAULT_STATE.settings, capturePaused: true, capturePausedUntil: 100 },
    }, 101);
    expect(state.settings).toMatchObject({ capturePaused: false, capturePausedUntil: null });
  });

  it('filters automatic categories and optional source metadata', () => {
    const settings: Settings = {
      ...DEFAULT_STATE.settings,
      autoCapture: true,
      captureConsentVersion: 1,
      captureConsentAt: 1,
      captureTypes: ['url'],
      capturePageTitle: false,
      captureSourceApp: false,
    };
    expect(prepareCapturedClip(settings, { content: 'ordinary text', title: 'Page' })).toBeNull();
    expect(prepareCapturedClip(settings, {
      content: 'https://example.com',
      title: 'Page',
      sourceUrl: 'https://source.test/page',
      sourceApp: 'Google Chrome',
    })).toEqual({ content: 'https://example.com', title: undefined, sourceUrl: 'https://source.test/page', sourceApp: undefined });
  });

  it('migrates missing settings and reclassifies legacy clips', () => {
    const state = migrateState({
      version: 1,
      clips: [{ ...makeClip('legacy', false, 1), content: 'const legacy = true;', type: 'text' }],
    });
    expect(state.settings).toEqual(DEFAULT_STATE.settings);
    expect(state.version).toBe(2);
    expect(state.clips[0].type).toBe('code');
  });

  it('pauses legacy automatic capture until the current disclosure is accepted', () => {
    const state = migrateState({
      version: 2,
      clips: [makeClip('kept', false, 1)],
      settings: { autoCapture: true, historyLimit: 500, excludedSites: [] },
    });
    expect(state.clips).toHaveLength(1);
    expect(state.settings).toMatchObject({ autoCapture: false, captureConsentVersion: 0 });
  });

  it('defaults older settings to light and preserves a valid dark preference', () => {
    expect(migrateState({ version: 2, clips: [], settings: { theme: 'unexpected' } }).settings.theme).toBe('light');
    expect(migrateState({ version: 2, clips: [], settings: { theme: 'dark' } }).settings.theme).toBe('dark');
  });

  it('preserves automatic capture after current affirmative consent', () => {
    const state = migrateState({
      version: 2,
      clips: [],
      settings: {
        autoCapture: true,
        historyLimit: 500,
        excludedSites: [],
        captureConsentVersion: 1,
        captureConsentAt: 123,
      },
    });
    expect(state.settings.autoCapture).toBe(true);
  });

  it('normalizes exclusions and matches subdomains', () => {
    expect(normalizeHostname('https://www.Example.com/path')).toBe('example.com');
    expect(isHostExcluded('docs.example.com', ['example.com'])).toBe(true);
    expect(isHostExcluded('notexample.com', ['example.com'])).toBe(false);
  });

  it('searches content, titles, and source URLs case-insensitively', () => {
    const clips: Clip[] = [{ ...makeClip('1', false, 1), content: 'Alpha', title: 'Project Home', sourceUrl: 'https://example.com' }];
    expect(filterClips(clips, 'PROJECT')).toHaveLength(1);
    expect(filterClips(clips, 'example')).toHaveLength(1);
    expect(filterClips(clips, 'missing')).toHaveLength(0);
  });
});
