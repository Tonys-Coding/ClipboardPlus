import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Clip } from '../lib/types';
import { CopyOriginalIcon, EditIcon, EyeIcon, MoreIcon, StarIcon, TrashIcon, WandIcon } from '../components/Icons';
import { hasSnippetFields } from '../lib/pasteTools';
import { moveFocusFrom } from './dialogA11y';
import { TypeGlyph } from './TypeGlyph';

interface ClipCardProps {
  clip: Clip;
  copied: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onCopy: (clip: Clip) => void;
  onCopyOriginal: (clip: Clip) => void;
  onPreview: (clip: Clip) => void;
  onTransform: (clip: Clip) => void;
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

const LABEL_EXCERPT_LENGTH = 80;

/** Screen readers get a short excerpt instead of an entire 50k-character clip. */
function clipRowLabel(clip: Clip): string {
  const flattened = clip.content.replace(/\s+/g, ' ').trim();
  const excerpt = flattened.slice(0, LABEL_EXCERPT_LENGTH);
  return `Copy ${clip.type} clip: ${excerpt}${flattened.length > LABEL_EXCERPT_LENGTH ? '…' : ''}`;
}

export function ClipCard({
  clip,
  copied,
  menuOpen,
  onMenuOpenChange,
  onCopy,
  onCopyOriginal,
  onPreview,
  onTransform,
  onEdit,
  onFavorite,
  onDelete,
}: ClipCardProps) {
  const [menuDirection, setMenuDirection] = useState<'down' | 'up'>('down');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openChangeRef = useRef(onMenuOpenChange);
  openChangeRef.current = onMenuOpenChange;
  const source = sourceHost(clip.sourceUrl);
  const snippet = hasSnippetFields(clip.content);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) openChangeRef.current(false);
    };
    document.addEventListener('mousedown', close);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusAt(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onMenuOpenChange(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      // Leaving the menu keeps a predictable focus destination instead of dropping to body.
      event.preventDefault();
      const trigger = triggerRef.current;
      const direction = event.shiftKey ? -1 : 1;
      onMenuOpenChange(false);
      // Deferred so the move happens after the menu subtree is removed.
      window.setTimeout(() => moveFocusFrom(trigger, direction), 0);
    }
  };

  const activate = (action: (clip: Clip) => void) => {
    triggerRef.current?.focus();
    action(clip);
    onMenuOpenChange(false);
  };

  return (
    <article className={`clip-card ${clip.type} ${copied ? 'is-copied' : ''} ${menuOpen ? 'menu-open' : ''}`}>
      <button data-clip-row className="clip-copy" type="button" onClick={() => onCopy(clip)} aria-label={clipRowLabel(clip)}>
        <span className={`type-icon ${clip.type}`} title={`${clip.type[0].toUpperCase()}${clip.type.slice(1)} clip`}>
          <TypeGlyph type={clip.type} />
        </span>
        <span className="clip-details">
          <strong className="clip-content" title={clip.content}>{clip.content}</strong>
          <span className="clip-meta">
            {source && <span>{source}</span>}
            <span>{clip.type.toUpperCase()}</span>
            {snippet && <span className="snippet-meta">SNIPPET</span>}
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
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            if (!menuOpen) {
              const trigger = triggerRef.current?.getBoundingClientRect();
              const menuHeight = snippet ? 250 : 214;
              setMenuDirection(trigger && window.innerHeight - trigger.bottom < menuHeight ? 'up' : 'down');
            }
            onMenuOpenChange(!menuOpen);
          }}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className={`clip-menu open-${menuDirection}`} role="menu" aria-label="Clip actions" onKeyDown={handleMenuKeyDown}>
            <button type="button" role="menuitem" onClick={() => activate(onPreview)}>
              <EyeIcon /> Preview
            </button>
            {snippet && (
              <button type="button" role="menuitem" onClick={() => activate(onCopyOriginal)}>
                <CopyOriginalIcon /> Copy original
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => activate(onFavorite)}>
              <StarIcon fill={clip.favorite ? 'currentColor' : 'none'} /> {clip.favorite ? 'Remove favorite' : 'Add to favorites'}
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onEdit)}>
              <EditIcon /> Edit
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onTransform)}>
              <WandIcon /> Transform &amp; copy
            </button>
            <button className="danger" type="button" role="menuitem" onClick={() => activate(onDelete)}>
              <TrashIcon /> Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
