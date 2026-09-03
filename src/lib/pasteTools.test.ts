import { describe, expect, it } from 'vitest';
import {
  applyPasteTransform,
  cleanWhitespace,
  extractSnippetFields,
  fillSnippet,
  formatJson,
  getPasteTransformOptions,
  hasSnippetFields,
  removeTrackingParameters,
  toTitleCase,
} from './pasteTools';

describe('smart snippets', () => {
  it('extracts unique named fields and supports defaults', () => {
    const template = 'Hi {{ First name }}, welcome to {{company|Clipboard+}}. Bye {{first name}}.';
    expect(extractSnippetFields(template)).toEqual([
      { key: 'first name', label: 'First name', defaultValue: '' },
      { key: 'company', label: 'company', defaultValue: 'Clipboard+' },
    ]);
    expect(hasSnippetFields(template)).toBe(true);
    expect(fillSnippet(template, { 'first name': 'Tony', company: '' })).toBe('Hi Tony, welcome to Clipboard+. Bye Tony.');
  });

  it('leaves ordinary braces and code untouched', () => {
    expect(hasSnippetFields('const value = { nested: true };')).toBe(false);
  });
});

describe('paste transformations', () => {
  it('cleans whitespace without flattening paragraphs', () => {
    expect(cleanWhitespace('  First\t line  \r\n\r\n\r\n Second   line ')).toBe('First line\n\nSecond line');
  });

  it('formats JSON objects and rejects scalar JSON', () => {
    expect(formatJson('{"ready":true,"items":[1,2]}')).toBe('{\n  "ready": true,\n  "items": [\n    1,\n    2\n  ]\n}');
    expect(() => formatJson('"hello"')).toThrow('not a JSON object');
  });

  it('converts casing', () => {
    expect(toTitleCase('smart snippets — made EASY')).toBe('Smart Snippets — Made Easy');
    expect(applyPasteTransform('Mixed Case', 'uppercase')).toBe('MIXED CASE');
    expect(applyPasteTransform('Mixed Case', 'lowercase')).toBe('mixed case');
  });

  it('removes known tracking parameters while retaining functional query data and fragments', () => {
    expect(removeTrackingParameters('https://example.com/article?id=42&utm_source=newsletter&gclid=abc#details'))
      .toBe('https://example.com/article?id=42#details');
    expect(removeTrackingParameters('Not a URL')).toBe('Not a URL');
  });

  it('marks transformations that would have no effect as unavailable', () => {
    const options = getPasteTransformOptions('already clean');
    expect(options.find((option) => option.id === 'clean-whitespace')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'uppercase')?.disabled).toBe(false);
    expect(options.find((option) => option.id === 'format-json')?.disabled).toBe(true);
  });
});
