import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { registerBottomSheet } from './bottomSheetRuntime';

export type BottomSheetProps = { open: boolean; title?: string; description?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'default' | 'danger'; onConfirm?: () => void | Promise<void>; onClose: () => void; children?: ReactNode; footer?: ReactNode };
export default function BottomSheet({ open, title, description, confirmLabel = 'Conferma', cancelLabel = 'Annulla', tone, onConfirm, onClose, children, footer }: BottomSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null); const panel = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [closing, setClosing] = useState(false);
  const titleId = useId(); const descriptionId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const dragged = useRef(false); const closingRef = useRef(false);
  function requestClose() {
    if (busyRef.current || closingRef.current) return;
    closingRef.current = true; setClosing(true);
    closeTimer.current = setTimeout(() => { closeRef.current(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }
  const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    setError(''); setClosing(false); closingRef.current = false; const node = dialog.current!;
    const previousFocus = document.activeElement;
    node.showModal();
    // Focus the dialog surface itself so native autofocus cannot jump to a
    // nested search input and open iOS's keyboard as a presenting side effect.
    node.focus({ preventScroll: true });
    content.current?.scrollTo(0, 0);
    const release = registerBottomSheet(node, content.current!);
    return () => { clearTimeout(closeTimer.current); node.style.transition = ''; node.style.transform = ''; node.close(); release(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const node = panel.current!;
    let startX = 0; let startY = 0; let startedAt = 0; let distance = 0; let mode: 'pending' | 'scroll' | 'drag' | 'ignore' = 'ignore'; let origin: HTMLElement | null = null;
    function canScroll(target: HTMLElement | null, dy: number) {
      for (let el = target; el && el !== node; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
          if (dy > 0 && el.scrollTop > 1 || dy < 0 && el.scrollTop < el.scrollHeight - el.clientHeight - 1) return true;
        }
      }
      return false;
    }
    function start(event: TouchEvent) {
      distance = 0; dragged.current = false;
      if (event.touches.length !== 1 || busyRef.current) { mode = 'ignore'; return; }
      origin = event.target instanceof HTMLElement ? event.target : (event.target as Element)?.parentElement;
      if (origin?.closest('input,textarea,select,[contenteditable="true"],input[type="range"]')) { mode = 'ignore'; return; }
      startX = event.touches[0].clientX; startY = event.touches[0].clientY; startedAt = performance.now(); mode = 'pending';
    }
    function move(event: TouchEvent) {
      if (event.touches.length !== 1 || mode === 'ignore' || busyRef.current) return;
      const dy = event.touches[0].clientY - startY; const dx = event.touches[0].clientX - startX;
      if (mode === 'pending') {
        if (Math.max(Math.abs(dy), Math.abs(dx)) < 8) return;
        if (Math.abs(dx) > Math.abs(dy)) { mode = 'ignore'; return; }
        mode = dy > 0 && !canScroll(origin, dy) ? 'drag' : 'scroll';
      }
      if (mode === 'drag') {
        if (event.cancelable) event.preventDefault();
        distance = Math.max(0, dy); dragged.current = true;
        node.style.transition = 'none'; node.style.transform = `translate3d(0,${distance}px,0)`;
      } else if (!canScroll(origin, dy) && event.cancelable) event.preventDefault();
    }
    function end() {
      if (mode === 'drag') {
        node.style.transition = ''; node.style.transform = '';
        const velocity = distance / Math.max(1, performance.now() - startedAt);
        if (distance > Math.min(110, node.clientHeight * .25) || distance > 40 && velocity > .5) requestCloseRef.current();
      }
      mode = 'ignore';
    }
    function cancel() { node.style.transition = ''; node.style.transform = ''; mode = 'ignore'; }
    node.addEventListener('touchstart', start, { passive: true }); node.addEventListener('touchmove', move, { passive: false }); node.addEventListener('touchend', end); node.addEventListener('touchcancel', cancel);
    return () => { node.removeEventListener('touchstart', start); node.removeEventListener('touchmove', move); node.removeEventListener('touchend', end); node.removeEventListener('touchcancel', cancel); };
  }, [open]);
  const panelView = <div ref={panel} className={`sheet-panel ${closing ? 'sheet-closing' : ''}`} data-sheet-panel="true" onClickCapture={event => { if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; } }}>
    <div className="sheet-handle" aria-hidden="true"><span /></div>
    <header className="sheet-header"><div>{title && <h2 id={titleId}>{title}</h2>}{description && <p id={descriptionId}>{description}</p>}</div></header>
    <div ref={content} className="sheet-content" data-sheet-content="true">{children}{error && <p role="alert" className="error-message">{error}</p>}</div>
    <footer className="sheet-footer" data-sheet-footer="true">
      {footer !== undefined ? footer : <>
        <Button variant="secondary" onClick={requestClose} disabled={busy}>{cancelLabel}</Button>
        {onConfirm && <Button loading={busy} variant={tone === 'danger' ? 'danger' : 'primary'} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); setBusy(false); closeRef.current(); } catch (e) { setError(e instanceof Error ? e.message : 'Operazione non riuscita'); setBusy(false); } }}>{confirmLabel}</Button>}
      </>}
    </footer>
  </div>;

  return createPortal(
    <dialog
      ref={dialog}
      className="bottom-sheet"
      tabIndex={-1}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClick={event => { if (event.target === dialog.current) requestClose(); }}
    >
      {panelView}
    </dialog>,
    document.body
  );
}
