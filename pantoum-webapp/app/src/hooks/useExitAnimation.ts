import { useState, useEffect, useRef } from 'react';

/**
 * Delays unmount so an exit animation can play.
 *
 * @param show   - Whether the element should be logically visible.
 * @param durationMs - Exit animation duration. Pass 0 to skip (instant unmount).
 * @returns `{ mounted, exiting }` — render when `mounted`, apply exit class when `exiting`.
 */
export function useExitAnimation(show: boolean, durationMs: number): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(show);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (show) {
      clearTimeout(timerRef.current);
      setExiting(false);
      setMounted(true);
    } else if (mounted) {
      if (durationMs <= 0) {
        setMounted(false);
        return;
      }
      setExiting(true);
      timerRef.current = setTimeout(() => {
        setExiting(false);
        setMounted(false);
      }, durationMs);
    }
    return () => clearTimeout(timerRef.current);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  return { mounted, exiting };
}
