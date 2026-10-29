import { useEffect, useRef } from 'react';
/** Native modal owns scrolling/focus; background remains at its original position. */
export function useRecordDialog(onClose: () => void) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (dialog && !dialog.open) {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        }
        const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); onClose(); };
        window.addEventListener('khata-back', back, true);
        return () => { document.body.style.overflow = overflow; window.removeEventListener('khata-back', back, true); };
    }, [onClose]);
    return ref;
}
