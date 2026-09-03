import type { AddClipInput, Clip, ClipType, Settings, StorageState } from './types';

export const STORAGE_KEY = 'clipboardPlus';
export const MAX_CLIP_LENGTH = 50_000;
export const DEFAULT_SETTINGS: Settings = { autoCapture: true, historyLimit: 500, excludedSites: [] };
export const DEFAULT_STATE: StorageState = { version: 1, clips: [], settings: DEFAULT_SETTINGS };

export function normalizeContent(value: string): string { return value.replace(/\r\n?/g, '\n').trim(); }

export function detectClipType(content: string): ClipType {
  try {
    const url = new URL(content);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !/\s/.test(content) ? 'url' : 'text';
  } catch { return 'text'; }
}

export function normalizeHostname(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  try { return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

export function isHostExcluded(hostname: string, excludedSites: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return excludedSites.some((site) => host === site || host.endsWith(`.${site}`));
}

export function pruneClips(clips: Clip[], limit: number): Clip[] {
  const favorites = clips.filter((clip) => clip.favorite).sort((a, b) => b.updatedAt - a.updatedAt);
  const history = clips.filter((clip) => !clip.favorite).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  return [...favorites, ...history].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function addClip(state: StorageState, input: AddClipInput, now = Date.now(), id: string = crypto.randomUUID()): StorageState {
  const content = normalizeContent(input.content);
  if (!content) throw new Error('Clipboard item is empty.');
  if (content.length > MAX_CLIP_LENGTH) throw new Error('Clipboard item is too long.');
  const duplicate = state.clips.find((clip) => clip.content === content);
  const next: Clip = duplicate
    ? { ...duplicate, type: detectClipType(content), title: input.title?.trim() || duplicate.title, sourceUrl: input.sourceUrl || duplicate.sourceUrl, sourceApp: input.sourceApp || duplicate.sourceApp, updatedAt: now }
    : { id: input.id || id, type: detectClipType(content), content, title: input.title?.trim() || undefined, sourceUrl: input.sourceUrl, sourceApp: input.sourceApp, favorite: false, createdAt: now, updatedAt: now };
  return { ...state, clips: pruneClips([next, ...state.clips.filter((clip) => clip.id !== next.id)], state.settings.historyLimit) };
}

export function migrateState(value: unknown): StorageState {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_STATE);
  const candidate = value as Partial<StorageState>;
  return {
    version: 1,
    clips: Array.isArray(candidate.clips) ? candidate.clips.map((clip) => ({ ...clip, type: detectClipType(clip.content) })) : [],
    settings: { ...DEFAULT_SETTINGS, ...(candidate.settings ?? {}), excludedSites: Array.isArray(candidate.settings?.excludedSites) ? candidate.settings.excludedSites : [] },
  };
}

export function filterClips(clips: Clip[], query: string): Clip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return clips;
  return clips.filter((clip) => [clip.content, clip.title, clip.sourceUrl, clip.sourceApp].some((value) => value?.toLowerCase().includes(needle)));
}
