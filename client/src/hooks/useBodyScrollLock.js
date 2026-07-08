import { useEffect } from 'react';

// Locks <body> scroll while `active` is true, restoring the previous value on
// release. Captures the prior overflow at activation so nested modals restore
// correctly (an inner modal that unlocks leaves an outer lock in place).
export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}
