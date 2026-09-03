import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../lib/types';
import { EditIcon, MoreIcon, StarIcon, TrashIcon } from '../components/Icons';
import { TypeGlyph } from './TypeGlyph';

interface ClipCardProps {
  clip: Clip;
  copied: boolean;
  onCopy: (clip: Clip) => void;
  onEdit: (clip: Clip) => void;
  onFavorite: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
}

function sourceHost(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

export function ClipCard({ clip, copied, onCopy, onEdit, onFavorite, onDelete }: ClipCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDirection, setMenuDirection] = useState<'down' | 'up'>('down');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const source = sourceHost(clip.sourceUrl);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <article className={`clip-card ${clip.type} ${copied ? 'is-copied' : ''} ${menuOpen ? 'menu-open' : ''}`}>
      <button className="clip-copy" type="button" onClick={() => onCopy(clip)} aria-label={`Copy ${clip.content}`}>
        <span className={`type-icon ${clip.type}`} title={`${clip.type[0].toUpperCase()}${clip.type.slice(1)} clip`}>
          <TypeGlyph type={clip.type} />
        </span>
        <span className="clip-details">
          <strong className="clip-content" title={clip.content}>{clip.content}</strong>
          <span className="clip-meta">
            {source && <span>{source}</span>}
            <span>{clip.type.toUpperCase()}</span>
            {clip.sourceApp && <span>{clip.sourceApp}</span>}
            <span>{relativeTime(clip.updatedAt)}</span>
          </span>
        </span>
        {copied && <span className="copied-label">Copied</span>}
      </button>
      {clip.favorite && <StarIcon className="favorite-indicator" fill="currentColor" />}
      <div className="clip-menu-wrap" ref={menuRef}>
        <button
          ref={triggerRef}
          className="icon-button menu-trigger"
          type="button"
          aria-label="Clip actions"
          aria-expanded={menuOpen}
          onClick={() => {
            if (!menuOpen) {
              const trigger = triggerRef.current?.getBoundingClientRect();
              setMenuDirection(trigger && window.innerHeight - trigger.bottom < 145 ? 'up' : 'down');
            }
            setMenuOpen((open) => !open);
          }}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className={`clip-menu open-${menuDirection}`} role="menu">
            <button type="button" role="menuitem" onClick={() => { onFavorite(clip); setMenuOpen(false); }}>
              <StarIcon fill={clip.favorite ? 'currentColor' : 'none'} /> {clip.favorite ? 'Remove favorite' : 'Add to favorites'}
            </button>
            <button type="button" role="menuitem" onClick={() => { onEdit(clip); setMenuOpen(false); }}>
              <EditIcon /> Edit
            </button>
            <button className="danger" type="button" role="menuitem" onClick={() => { onDelete(clip); setMenuOpen(false); }}>
              <TrashIcon /> Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
