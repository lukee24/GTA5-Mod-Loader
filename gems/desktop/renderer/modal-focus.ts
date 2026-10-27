import {useLayoutEffect, useRef} from 'react';

/** Keep keyboard input in the top dialog and restore the invoking control after dismissal. */
export function useModalFocus(key: string | null, close: () => void, busy: boolean) {
  const current = useRef({close, busy});
  current.current = {close, busy};
  useLayoutEffect(() => {
    if (!key) return;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
    const dialog = dialogs.find(d => d.getAttribute('role') === 'alertdialog') ?? dialogs.at(-1);
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const backdrop = dialog.parentElement!;
    const siblings = Array.from(backdrop.parentElement!.children).filter(e => e !== backdrop) as HTMLElement[];
    const inert = siblings.map(e => e.inert);
    siblings.forEach(e => {e.inert = true;});
    dialog.tabIndex = -1;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]'))
      .filter(e => e.tabIndex >= 0 && !e.matches(':disabled') && e.getClientRects().length > 0);
    (controls()[0] ?? dialog).focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!current.current.busy) current.current.close();
      } else if (event.key === 'Tab') {
        const items = controls();
        const index = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        if (!items.length) dialog!.focus();
        else items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    }
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      siblings.forEach((e, i) => {e.inert = inert[i];});
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, [key]);
}
