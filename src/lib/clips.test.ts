import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  CLIP_CLASSIFIER_VERSION,
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

  it.each([
    'const total = items.reduce((sum, item) => sum + item.price, 0);',
    'function greet(name) { return `Hello ${name}`; }',
    'def greet(name):\n  return f"Hello {name}"',
    '<div class="notice">Hello</div>',
    'body { color: red; }',
    'SELECT * FROM customers WHERE active = 1;',
    '$ npm run build',
    '```typescript\nconst count = 1;\n```',
  ])('recognizes strong code syntax: %s', (content) => {
    expect(detectClipType(content)).toBe('code');
  });

  it.each([
    'Write a function if {examples} are available, then return [notes].',
    'Please format <strong>important</strong> text and send it to me.',
    'SELECT a quote FROM the list and explain why it matters.',
    'The style body { color: red; } appears in the article.',
    'If the class starts late, let me know. [Room 204]',
    'The word return appears in this paragraph; it is not source code.',
    'Use `const` in the explanation and include {two examples}.',
    'class room is available for the next meeting.',
    'if (you can) { please call me }',
    '```text\nThis is just a note with {braces}.\n```',
    'Here is my explanation:\n```js\nconst value = 1;\n```\nPlease read it first.',
  ])('keeps code-like prose in Text: %s', (content) => {
    expect(detectClipType(content)).toBe('text');
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

  it('does not treat code-like prose as a Code-only capture', () => {
    const settings: Settings = {
      ...DEFAULT_STATE.settings,
      autoCapture: true,
      captureTypes: ['code'],
    };
    expect(prepareCapturedClip(settings, { content: 'Write a function if {examples} are available, then return [notes].' })).toBeNull();
    expect(prepareCapturedClip(settings, { content: 'const answer = 42;' })).toMatchObject({ content: 'const answer = 42;' });
  });

  it('migrates missing settings and reclassifies legacy clips', () => {
    const state = migrateState({
      version: 1,
      clips: [{ ...makeClip('legacy', false, 1), content: 'const legacy = true;', type: 'text' }],
    });
    expect(state.settings).toEqual(DEFAULT_STATE.settings);
    expect(state.version).toBe(2);
    expect(state.clips[0].type).toBe('code');
    expect(state.classificationVersion).toBe(CLIP_CLASSIFIER_VERSION);
  });

  it('reclassifies old Code entries once without changing content, favorites, or timestamps', () => {
    const mistaken = {
      ...makeClip('mistaken', true, 123),
      type: 'code' as const,
      content: 'Write a function if {examples} are available, then return [notes].',
    };
    const actualCode = { ...makeClip('real', false, 100), content: 'const answer = 42;' };
    const migrated = migrateState({
      version: 2,
      clips: [mistaken, actualCode],
      settings: DEFAULT_STATE.settings,
    });
    expect(migrated.classificationVersion).toBe(CLIP_CLASSIFIER_VERSION);
    expect(migrated.clips.find((clip) => clip.id === 'mistaken')).toEqual({ ...mistaken, type: 'text' });
    expect(migrated.clips.find((clip) => clip.id === 'real')?.type).toBe('code');
    expect(migrateState(migrated)).toEqual(migrated);
  });

  it('cleans a full 500-clip history without dropping records', () => {
    const clips = Array.from({ length: 500 }, (_, index) => ({
      ...makeClip(`old-${index}`, false, index + 1),
      type: 'code' as const,
      content: `Please return note [${index}] with {examples}.`,
    }));
    const migrated = migrateState({ version: 2, clips, settings: DEFAULT_STATE.settings });
    expect(migrated.clips).toHaveLength(500);
    expect(migrated.clips.every((clip) => clip.type === 'text')).toBe(true);
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
