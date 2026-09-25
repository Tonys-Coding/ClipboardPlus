import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(node: HTMLElement): HTMLElement[] {
  const candidates = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
  const rendered = candidates.filter((element) => element.getClientRects().length > 0);
  return rendered.length ? rendered : candidates;
}

/** Moves focus to the next or previous tabbable control, skipping inert subtrees. */
export function moveFocusFrom(element: HTMLElement | null, direction: 1 | -1): void {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((node) => !node.closest('[inert]') && node.getAttribute('aria-hidden') !== 'true');
  if (!candidates.length) return;
  const index = element ? candidates.indexOf(element) : -1;
  const next = index < 0 ? candidates[0] : candidates[index + direction];
  next?.focus();
}

/**
 * Shared dialog behavior for the popup: initial focus, focus trap, and Escape to close.
 * The popup owns focus restoration so a dialog that opens another dialog still returns
 * to the control that started the sequence.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    if (!node.contains(document.activeElement)) {
      const initial = node.querySelector<HTMLElement>('[data-initial-focus]') ?? focusableElements(node)[0];
      initial?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusableElements(node);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return dialogRef;
}
