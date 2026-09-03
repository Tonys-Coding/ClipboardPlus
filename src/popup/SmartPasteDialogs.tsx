import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckIcon, WandIcon, XIcon } from '../components/Icons';
import {
  applyPasteTransform,
  extractSnippetFields,
  fillSnippet,
  getPasteTransformOptions,
  hasSnippetFields,
  type PasteTransformId,
} from '../lib/pasteTools';
import type { Clip } from '../lib/types';

interface DialogBaseProps {
  clip: Clip;
  onClose: () => void;
}

interface SnippetDialogProps extends DialogBaseProps {
  template: string;
  onCopy: (content: string, clip: Clip) => Promise<boolean>;
}

interface TransformDialogProps extends DialogBaseProps {
  onUseResult: (content: string, clip: Clip) => void;
}

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
}

export function SnippetDialog({ clip, template, onClose, onCopy }: SnippetDialogProps) {
  const fields = useMemo(() => extractSnippetFields(template), [template]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    fields.map((field) => [field.key, field.defaultValue]),
  ));
  const preview = useMemo(() => fillSnippet(template, values), [template, values]);
  const complete = fields.every((field) => Boolean(values[field.key]?.trim()));
  useEscapeToClose(onClose);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (complete && await onCopy(preview, clip)) onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="edit-modal smart-modal" onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="snippet-heading">
        <div className="modal-heading">
          <div><span className="modal-kicker">Smart snippet</span><h2 id="snippet-heading">Fill in the fields</h2></div>
          <button type="button" className="icon-button" aria-label="Close snippet dialog" onClick={onClose}><XIcon /></button>
        </div>
        <div className="snippet-fields">
          {fields.map((field, index) => (
            <label key={field.key} htmlFor={`snippet-field-${index}`}>
              <span>{field.label}</span>
              <input
                id={`snippet-field-${index}`}
                autoFocus={index === 0}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.defaultValue || `Enter ${field.label}`}
                maxLength={10_000}
                required
              />
            </label>
          ))}
        </div>
        <div className="smart-preview" aria-label="Snippet preview">{preview}</div>
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={!complete}><CheckIcon /> Copy snippet</button>
        </div>
      </form>
    </div>
  );
}

export function TransformDialog({ clip, onClose, onUseResult }: TransformDialogProps) {
  const options = useMemo(() => getPasteTransformOptions(clip.content), [clip.content]);
  const firstAvailable = options.find((option) => !option.disabled)?.id ?? null;
  const [selected, setSelected] = useState<PasteTransformId | null>(firstAvailable);
  const result = useMemo(() => selected ? applyPasteTransform(clip.content, selected) : clip.content, [clip.content, selected]);
  useEscapeToClose(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="edit-modal smart-modal" role="dialog" aria-modal="true" aria-labelledby="transform-heading">
        <div className="modal-heading">
          <div><span className="modal-kicker">Paste transformations</span><h2 id="transform-heading">Transform and copy</h2></div>
          <button type="button" className="icon-button" aria-label="Close transformation dialog" onClick={onClose}><XIcon /></button>
        </div>
        <div className="transform-options" role="group" aria-label="Choose a transformation">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              aria-pressed={selected === option.id}
              className={selected === option.id ? 'selected' : ''}
              onClick={() => setSelected(option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
        <div className="smart-preview" aria-label="Transformation preview">{result}</div>
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            disabled={!selected}
            onClick={() => { if (selected) onUseResult(result, clip); }}
          >
            <WandIcon /> {hasSnippetFields(result) ? 'Fill fields' : 'Copy result'}
          </button>
        </div>
      </div>
    </div>
  );
}
