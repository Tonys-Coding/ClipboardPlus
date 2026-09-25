import { FormEvent, useState } from 'react';
import { CheckIcon, XIcon } from '../components/Icons';
import type { Clip } from '../lib/types';
import { useDialogA11y } from './dialogA11y';

interface EditDialogProps {
  clip: Clip;
  onClose: () => void;
  onSave: (content: string) => Promise<boolean>;
}

export function EditDialog({ clip, onClose, onSave }: EditDialogProps) {
  const [draft, setDraft] = useState(clip.content);
  const dialogRef = useDialogA11y<HTMLFormElement>(onClose);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onSave(draft)) onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef} className="edit-modal" onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="edit-heading">
        <div className="modal-heading"><h2 id="edit-heading">Edit clip</h2><button type="button" className="icon-button" aria-label="Close edit dialog" onClick={onClose}><XIcon /></button></div>
        <label htmlFor="edit-clip">Content</label>
        <textarea id="edit-clip" data-initial-focus="true" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={50_000} required />
        <div className="form-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!draft.trim()}><CheckIcon /> Save changes</button></div>
      </form>
    </div>
  );
}
