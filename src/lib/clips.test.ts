import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, addClip, detectClipType, migrateState, normalizeContent, pruneClips } from './clips';
import type { Clip, StorageState } from './types';

const makeClip = (id: string, favorite: boolean, updatedAt: number): Clip => ({ id, type: 'text', content: `clip ${id}`, favorite, createdAt: updatedAt, updatedAt });
describe('clip behavior', () => {
  it('normalizes content and detects web URLs', () => { expect(normalizeContent(' hi\r\nthere ')).toBe('hi\nthere'); expect(detectClipType('https://example.com')).toBe('url'); expect(detectClipType('See https://example.com')).toBe('text'); });
  it('deduplicates content and preserves favorite status', () => { const existing = { ...makeClip('a', true, 1), content: 'same' }; const state: StorageState = { ...DEFAULT_STATE, clips: [makeClip('b', false, 2), existing] }; const result = addClip(state, { content: ' same ' }, 50, 'unused'); expect(result.clips.map((clip) => clip.id)).toEqual(['a', 'b']); expect(result.clips[0].favorite).toBe(true); });
  it('prunes only non-favorites', () => { expect(pruneClips([makeClip('old', false, 1), makeClip('favorite', true, 2), makeClip('new', false, 3)], 1).map((clip) => clip.id)).toEqual(['new', 'favorite']); });
  it('fills storage defaults', () => { expect(migrateState({ clips: [] })).toEqual(DEFAULT_STATE); });
});
