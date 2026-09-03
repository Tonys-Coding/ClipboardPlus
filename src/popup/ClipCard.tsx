import { useEffect, useRef, useState } from 'react';
import { EditIcon, LinkIcon, MoreIcon, StarIcon, TrashIcon, ClipboardIcon } from '../components/Icons';
import type { Clip } from '../lib/types';

interface Props {
  clip: Clip; copied: boolean; onCopy: (clip: Clip) => void; onEdit: (clip: Clip) => void;
  onFavorite: (clip: Clip) => void; onDelete: (clip: Clip) => void;
}

export function ClipCard({ clip, copied, onCopy, onEdit, onFavorite, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <article className="clip-card">
      <button className="clip-copy" type="button" onClick={() => onCopy(clip)} aria-label={`Copy ${clip.title || clip.content}`}>
        <span className="type-icon">{clip.type === 'url' ? <LinkIcon /> : <ClipboardIcon />}</span>
        <span className="clip-details">{clip.title && <strong>{clip.title}</strong>}<span>{clip.content}</span></span>
        {copied && <span className="copied-label">Copied</span>}
      </button>
      {clip.favorite && <StarIcon className="favorite-indicator" fill="currentColor" />}
      <div className="clip-menu-wrap" ref={menuRef}>
        <button className="icon-button" type="button" aria-label="Clip actions" onClick={() => setOpen((value) => !value)}><MoreIcon /></button>
        {open && <div className="clip-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { onFavorite(clip); setOpen(false); }}><StarIcon />{clip.favorite ? 'Remove favorite' : 'Add to favorites'}</button>
          <button type="button" role="menuitem" onClick={() => { onEdit(clip); setOpen(false); }}><EditIcon />Edit</button>
          <button className="danger" type="button" role="menuitem" onClick={() => { onDelete(clip); setOpen(false); }}><TrashIcon />Delete</button>
        </div>}
      </div>
    </article>
  );
}
