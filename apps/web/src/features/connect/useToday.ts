import { useEffect, useState } from 'react';

/**
 * "Now" for day labels (Today, Yesterday…). The returned Date only changes when the
 * local calendar day does — checked just after midnight and whenever the tab becomes
 * visible or focused again (timers are throttled in background tabs) — so memoized
 * layouts recompute once a day instead of keeping a stale "Today".
 */
export function useToday(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const check = () =>
      setNow((prev) => {
        const d = new Date();
        return d.toDateString() === prev.toDateString() ? prev : d;
      });
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        check();
        schedule();
      }, midnight.getTime() - Date.now());
    };
    schedule();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);
  return now;
}
