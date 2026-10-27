import { CodeXml, Link2, PencilRuler } from 'lucide-react';
import type { ClipType } from '../lib/types';

interface TypeGlyphProps {
  type: ClipType;
  className?: string;
}

export function TypeGlyph({ type, className = '' }: TypeGlyphProps) {
  const Icon = type === 'code' ? CodeXml : type === 'url' ? Link2 : PencilRuler;
  return <Icon className={`kind-glyph ${type} ${className}`.trim()} aria-hidden="true" focusable="false" strokeWidth={1.8} />;
}
