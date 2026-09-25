import { CheckIcon, CopyOriginalIcon, XIcon } from '../components/Icons';
import { hasSnippetFields } from '../lib/pasteTools';
import type { Clip } from '../lib/types';
import { useDialogA11y } from './dialogA11y';
import { TypeGlyph } from './TypeGlyph';

const TYPE_LABELS: Record<Clip['type'], string> = { text: 'Text', url: 'Link', code: 'Code' };

interface PreviewDialogProps {
  clip: Clip;
  onClose: () => void;
  onCopy: (clip: Clip) => void;
  onCopyOriginal: (clip: Clip) => void;
}

function sourceHost(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function PreviewDialog({ clip, onClose, onCopy, onCopyOriginal }: PreviewDialogProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const source = sourceHost(clip.sourceUrl);
  const snippet = hasSnippetFields(clip.content);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="edit-modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-heading" ref={dialogRef}>
        <div className="modal-heading">
          <div>
            <span className="modal-kicker">Clip preview</span>
            <h2 id="preview-heading">{TYPE_LABELS[clip.type]} clip</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close preview" onClick={onClose}><XIcon /></button>
        </div>

        <dl className="preview-meta">
          <div><dt>Type</dt><dd><TypeGlyph type={clip.type} />{TYPE_LABELS[clip.type]}</dd></div>
          <div><dt>Characters</dt><dd>{clip.content.length.toLocaleString()}</dd></div>
          {source && <div><dt>Site</dt><dd>{source}</dd></div>}
          {clip.sourceApp && <div><dt>Captured in</dt><dd>{clip.sourceApp}</dd></div>}
          <div><dt>Updated</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(clip.updatedAt)}</dd></div>
        </dl>

        {clip.title && <p className="preview-title" title={clip.title}>{clip.title}</p>}

        <pre className={`preview-body ${clip.type === 'code' ? 'code' : 'prose'}`} aria-label="Clip content" tabIndex={0} data-initial-focus>{clip.content}</pre>

        <div className="form-actions">
          <button type="button" className="text-button" onClick={onClose}>Close</button>
          {snippet && (
            <button type="button" className="text-button with-icon" onClick={() => onCopyOriginal(clip)}>
              <CopyOriginalIcon /> Copy original
            </button>
          )}
          <button type="button" className="primary-button" onClick={() => onCopy(clip)}>
            <CheckIcon /> {snippet ? 'Fill fields' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
