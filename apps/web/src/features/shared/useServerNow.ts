import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

/**
 * A ticking clock synced to the server, so countdowns don't drift with the
 * student's local clock: offset = serverTime − clientTime, re-synced every 60s.
 * Returns the current server-synced time in epoch ms, updated every second.
 */
export function useServerNow(): number {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const sync = () =>
      api
        .get<{ serverTime: string }>('/time')
        .then(({ serverTime }) => {
          if (active) offsetRef.current = new Date(serverTime).getTime() - Date.now();
        })
        .catch(() => {
          /* keep the last known offset */
        });
    void sync();
    const ticker = window.setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    const resync = window.setInterval(() => void sync(), 60_000);
    return () => {
      active = false;
      window.clearInterval(ticker);
      window.clearInterval(resync);
    };
  }, []);

  return now;
}
