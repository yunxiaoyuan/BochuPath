import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Shared modal with focus restoration/trapping for permission operations. */
export function AccessDialog({ title, children, onClose, busy = false, drawer = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = ref.current;
    const focusable = () => Array.from(card?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []);
    (focusable()[0] ?? card)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      } else if (event.key === 'Tab') {
        const all = focusable();
        const first = all[0];
        const last = all.at(-1);
        if (!first) { event.preventDefault(); card?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop access-modal-backdrop${drawer ? ' access-drawer-backdrop' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className={`modal-card access-dialog${drawer ? ' access-drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} ref={ref} tabIndex={-1}>
      <div className="access-dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="关闭对话框" onClick={onClose} disabled={busy}>×</button></div>
      {children}
    </section>
  </div>, document.body);
}
