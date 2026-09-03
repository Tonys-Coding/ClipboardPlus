import type { ClipType } from '../lib/types';

interface TypeGlyphProps {
  type: ClipType;
  className?: string;
}

export function TypeGlyph({ type, className = '' }: TypeGlyphProps) {
  return <span className={`kind-glyph ${type} ${className}`.trim()} aria-hidden="true" />;
}
