import { useEffect, useRef, useState } from 'react';
import { fetchServerTime } from './api';

/**
 * Server-authoritative countdown. The client trusts server time, not its own clock:
 *   offset = serverTime - clientTime  (computed at start, re-synced every 60s)
 *   remaining = deadline - (Date.now() + offset)
 * The server still decides when time is truly up (autosave 409 / auto-submit) — this only drives UI.
 */
export function useExamClock(deadlineIso: string, initialServerTime: string) {
  const deadline = new Date(deadlineIso).getTime();
  const offsetRef = useRef(new Date(initialServerTime).getTime() - Date.now());
  const [remainingMs, setRemainingMs] = useState(() => deadline - (Date.now() + offsetRef.current));

  useEffect(() => {
    const tick = () => setRemainingMs(deadline - (Date.now() + offsetRef.current));
    tick();
    const ticker = window.setInterval(tick, 1000);
    const resync = window.setInterval(() => {
      fetchServerTime()
        .then(({ serverTime }) => {
          offsetRef.current = new Date(serverTime).getTime() - Date.now();
        })
        .catch(() => {
          /* keep the last known offset */
        });
    }, 60_000);
    return () => {
      window.clearInterval(ticker);
      window.clearInterval(resync);
    };
  }, [deadline]);

  return { remainingMs: Math.max(0, remainingMs), expired: remainingMs <= 0 };
}
