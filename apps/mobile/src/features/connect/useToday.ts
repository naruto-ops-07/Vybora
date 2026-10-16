import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * "Now" for day labels (Today, Yesterday…). The returned Date only changes when the
 * local calendar day does — checked just after midnight and whenever the app becomes
 * active again — so memoized layouts recompute once a day instead of keeping a stale
 * "Today".
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
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return now;
}
