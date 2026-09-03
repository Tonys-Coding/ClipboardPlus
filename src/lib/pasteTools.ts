export type PasteTransformId = 'clean-whitespace' | 'format-json' | 'uppercase' | 'lowercase' | 'title-case' | 'remove-tracking';

export interface SnippetField {
  key: string;
  label: string;
  defaultValue: string;
}

export interface PasteTransformOption {
  id: PasteTransformId;
  label: string;
  description: string;
  disabled: boolean;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9 ._-]{0,39}?)(?:\s*\|\s*([^{}]*?))?\s*\}\}/g;
const TRACKING_PARAMETERS = new Set([
  'dclid',
  'fbclid',
  'gclid',
  'gbraid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  's_cid',
  'vero_conv',
  'vero_id',
  'wbraid',
  '_hsenc',
  '_hsmi',
]);

function fieldKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function extractSnippetFields(content: string): SnippetField[] {
  const fields = new Map<string, SnippetField>();
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const label = match[1].trim().replace(/\s+/g, ' ');
    const key = fieldKey(label);
    if (!fields.has(key)) {
      fields.set(key, { key, label, defaultValue: match[2]?.trim() ?? '' });
    }
  }
  return [...fields.values()];
}

export function hasSnippetFields(content: string): boolean {
  return extractSnippetFields(content).length > 0;
}

export function fillSnippet(content: string, values: Record<string, string>): string {
  return content.replace(PLACEHOLDER_PATTERN, (_token, rawLabel: string, rawDefault: string | undefined) => {
    const replacement = values[fieldKey(rawLabel)];
    return replacement === undefined || replacement === '' ? rawDefault?.trim() ?? '' : replacement;
  });
}

export function cleanWhitespace(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim().replace(/[\t ]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatJson(content: string): string {
  const parsed: unknown = JSON.parse(content);
  if (parsed === null || typeof parsed !== 'object') throw new Error('This clip is not a JSON object or array.');
  return JSON.stringify(parsed, null, 2);
}

export function toTitleCase(content: string): string {
  return content.toLocaleLowerCase().replace(/(^|[\s\-–—/([{])([\p{L}\p{N}])/gu, (_match, prefix: string, character: string) => (
    `${prefix}${character.toLocaleUpperCase()}`
  ));
}

export function removeTrackingParameters(content: string): string {
  let url: URL;
  try {
    url = new URL(content.trim());
  } catch {
    return content;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return content;

  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLocaleLowerCase();
    if (normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? url.toString() : content;
}

export function applyPasteTransform(content: string, id: PasteTransformId): string {
  switch (id) {
    case 'clean-whitespace': return cleanWhitespace(content);
    case 'format-json': return formatJson(content);
    case 'uppercase': return content.toLocaleUpperCase();
    case 'lowercase': return content.toLocaleLowerCase();
    case 'title-case': return toTitleCase(content);
    case 'remove-tracking': return removeTrackingParameters(content);
  }
}

export function getPasteTransformOptions(content: string): PasteTransformOption[] {
  const candidates: Array<Omit<PasteTransformOption, 'disabled'>> = [
    { id: 'clean-whitespace', label: 'Clean whitespace', description: 'Fix spacing and excessive blank lines' },
    { id: 'format-json', label: 'Format JSON', description: 'Indent valid objects and arrays' },
    { id: 'uppercase', label: 'UPPERCASE', description: 'Capitalize every letter' },
    { id: 'lowercase', label: 'lowercase', description: 'Lowercase every letter' },
    { id: 'title-case', label: 'Title Case', description: 'Capitalize each word' },
    { id: 'remove-tracking', label: 'Clean link', description: 'Remove common tracking parameters' },
  ];

  return candidates.map((option) => {
    try {
      return { ...option, disabled: applyPasteTransform(content, option.id) === content };
    } catch {
      return { ...option, disabled: true };
    }
  });
}
