import type { AddClipInput, Clip, ClipType, RetentionDays, Settings, StorageState } from './types';

export const STORAGE_KEY = 'clipboardPlus';
export const MAX_CLIP_LENGTH = 50_000;
export const CAPTURE_CONSENT_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  autoCapture: false,
  historyLimit: 500,
  retentionDays: 0,
  excludedSites: [],
  captureTypes: ['text', 'url', 'code'],
  capturePaused: false,
  capturePausedUntil: null,
  capturePageTitle: true,
  captureSourceUrl: true,
  captureSourceApp: true,
  captureConsentVersion: 0,
};

export const DEFAULT_STATE: StorageState = {
  version: 2,
  clips: [],
  settings: DEFAULT_SETTINGS,
};

export function normalizeContent(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export function looksLikeCode(content: string): boolean {
  const value = content.trim();
  if (value.length < 4) return false;
  if (/^```[\s\S]*```$/m.test(value) || /^#!\s*\/\S+/m.test(value)) return true;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object') return true;
  } catch {
    // Most code is not JSON; continue with syntax signals.
  }

  if (/<[a-z][^>]*>[\s\S]*<\/[a-z][^>]*>|<[a-z][^>]*\/>/i.test(value)) return true;
  if (/\b(?:SELECT[\s\S]+FROM|INSERT\s+INTO|UPDATE[\s\S]+SET|CREATE\s+TABLE)\b/i.test(value)) return true;
  if (/(?:^|\n)\s*(?:[#.$][\w-]+|[a-z][\w-]*(?:\s+[.#][\w-]+)?)\s*\{[^}]+:[^}]+\}/im.test(value)) return true;

  let score = 0;
  if (/\b(?:const|let|var|function|class|interface|enum|type|import|export|return|async|await|def|lambda|public|private|protected|package|namespace|func|struct|if|else|switch|case|for|while|try|catch|throw|new)\b/.test(value)) score += 2;
  if (/=>|===|!==|==|!=|:=|->|&&|\|\||\?\?/.test(value)) score += 2;
  if (/[{}[\]]/.test(value)) score += 1;
  if (/;\s*(?:\n|$)/m.test(value)) score += 1;
  if (/\b[\w.$]+\([^\n)]*\)\s*(?:[{:;]|=>|$)/m.test(value)) score += 1;
  if (/\n(?:\t| {2,})\S/.test(value)) score += 1;
  if (/^(?:\$|>)\s+(?:npm|pnpm|yarn|git|curl|brew|python|node|swift|cargo)\b/m.test(value)) score += 3;
  return score >= 3;
}

export function detectClipType(content: string): ClipType {
  try {
    const url = new URL(content);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !/\s/.test(content)) return 'url';
  } catch {
    // Continue with local text classification.
  }
  return looksLikeCode(content) ? 'code' : 'text';
}

export function normalizeHostname(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  try {
    return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isHostExcluded(hostname: string, excludedSites: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return excludedSites.some((site) => host === site || host.endsWith(`.${site}`));
}

export function pruneClips(clips: Clip[], limit: number): Clip[] {
  const favorites = clips.filter((clip) => clip.favorite).sort((a, b) => b.updatedAt - a.updatedAt);
  const history = clips
    .filter((clip) => !clip.favorite)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
  return [...favorites, ...history].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function pruneExpiredClips(clips: Clip[], retentionDays: RetentionDays, now = Date.now()): Clip[] {
  if (retentionDays === 0) return clips;
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  return clips.filter((clip) => clip.favorite || clip.updatedAt >= cutoff);
}

export function captureIsPaused(settings: Settings, now = Date.now()): boolean {
  if (!settings.capturePaused) return false;
  return settings.capturePausedUntil === null || settings.capturePausedUntil > now;
}

export function maintainState(state: StorageState, now = Date.now()): StorageState {
  const pauseExpired = state.settings.capturePaused
    && state.settings.capturePausedUntil !== null
    && state.settings.capturePausedUntil <= now;
  const settings = pauseExpired
    ? { ...state.settings, capturePaused: false, capturePausedUntil: null }
    : state.settings;
  const clips = pruneClips(
    pruneExpiredClips(state.clips, settings.retentionDays, now),
    settings.historyLimit,
  );
  return { ...state, settings, clips };
}

export function prepareCapturedClip(
  settings: Settings,
  input: AddClipInput,
  now = Date.now(),
): AddClipInput | null {
  if (!settings.autoCapture || captureIsPaused(settings, now)) return null;
  const content = normalizeContent(input.content);
  if (!content || !settings.captureTypes.includes(detectClipType(content))) return null;
  return {
    content,
    title: settings.capturePageTitle ? input.title : undefined,
    sourceUrl: settings.captureSourceUrl ? input.sourceUrl : undefined,
    sourceApp: settings.captureSourceApp ? input.sourceApp : undefined,
  };
}

export function addClip(
  state: StorageState,
  input: AddClipInput,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): StorageState {
  const content = normalizeContent(input.content);
  if (!content) throw new Error('Clipboard item is empty.');
  if (content.length > MAX_CLIP_LENGTH) throw new Error('Clipboard item is too long.');

  const duplicate = state.clips.find((clip) => clip.content === content);
  const nextClip: Clip = duplicate
    ? {
        ...duplicate,
        type: detectClipType(content),
        title: input.title?.trim() || duplicate.title,
        sourceUrl: input.sourceUrl || duplicate.sourceUrl,
        sourceApp: input.sourceApp || duplicate.sourceApp,
        updatedAt: now,
      }
    : {
        id: input.id || id,
        type: detectClipType(content),
        content,
        title: input.title?.trim() || undefined,
        sourceUrl: input.sourceUrl,
        sourceApp: input.sourceApp,
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };

  return {
    ...state,
    clips: pruneClips(
      [nextClip, ...state.clips.filter((clip) => clip.id !== nextClip.id)],
      state.settings.historyLimit,
    ),
  };
}

export function migrateState(value: unknown): StorageState {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_STATE);
  const candidate = value as Partial<StorageState>;
  const needsTypeMigration = candidate.version !== 2;
  const storedSettings: Partial<Settings> = candidate.settings ?? {};
  const hasCurrentConsent = typeof storedSettings.captureConsentVersion === 'number'
    && storedSettings.captureConsentVersion >= CAPTURE_CONSENT_VERSION
    && typeof storedSettings.captureConsentAt === 'number';
  const retentionDays = [0, 1, 7, 30, 90].includes(Number(storedSettings.retentionDays))
    ? Number(storedSettings.retentionDays) as RetentionDays
    : DEFAULT_SETTINGS.retentionDays;
  const captureTypes = Array.isArray(storedSettings.captureTypes)
    ? [...new Set(storedSettings.captureTypes.filter((type): type is ClipType => ['text', 'url', 'code'].includes(type)))]
    : DEFAULT_SETTINGS.captureTypes;
  return maintainState({
    version: 2,
    clips: Array.isArray(candidate.clips)
      ? candidate.clips.map((clip) => ({
          ...clip,
          type: needsTypeMigration || !['text', 'url', 'code'].includes(clip.type)
            ? typeof clip?.content === 'string' ? detectClipType(clip.content) : 'text'
            : clip.type,
        }))
      : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      autoCapture: hasCurrentConsent && storedSettings.autoCapture === true,
      retentionDays,
      excludedSites: Array.isArray(candidate.settings?.excludedSites)
        ? candidate.settings.excludedSites
        : [],
      captureTypes: captureTypes.length ? captureTypes : DEFAULT_SETTINGS.captureTypes,
      capturePaused: storedSettings.capturePaused === true,
      capturePausedUntil: typeof storedSettings.capturePausedUntil === 'number'
        ? storedSettings.capturePausedUntil
        : null,
      capturePageTitle: storedSettings.capturePageTitle !== false,
      captureSourceUrl: storedSettings.captureSourceUrl !== false,
      captureSourceApp: storedSettings.captureSourceApp !== false,
    },
  });
}

export function filterClips(clips: Clip[], query: string): Clip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return clips;
  return clips.filter((clip) =>
    [clip.content, clip.title, clip.sourceUrl, clip.sourceApp].some((value) => value?.toLowerCase().includes(needle)),
  );
}
