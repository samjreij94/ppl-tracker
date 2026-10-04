import { useEffect, type ReactNode } from 'react';

/** Modal bottom sheet: the body scrolls; an optional `footer` (actions) stays pinned at the bottom, above the safe area. */
export function BottomSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-body" data-testid="sheet-body">{children}</div>
        {footer && <div className="sheet-foot" data-testid="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
