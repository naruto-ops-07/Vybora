export interface TimeOpts {
  /** IANA zone; defaults to the device zone. */
  timeZone?: string;
  /** BCP 47 locale for names and clock format; defaults to the device locale. */
  locale?: string;
}

const MINUTE = 60_000;

/**
 * Formatters are expensive to build and these helpers run per message per render,
 * so they are cached by locale, zone and options (a handful of combinations in practice).
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(opts: TimeOpts, fmt: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${opts.locale ?? ''}|${opts.timeZone ?? ''}|${JSON.stringify(fmt)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(opts.locale, { ...fmt, timeZone: opts.timeZone });
    formatters.set(key, f);
  }
  return f;
}

function parts(date: Date, opts: TimeOpts, fmt: Intl.DateTimeFormatOptions) {
  return formatter(opts, fmt).formatToParts(date);
}

function part(ps: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return ps.find((p) => p.type === type)?.value ?? '';
}

/** Calendar day of `date` in the reader's zone, as 'YYYY-MM-DD'. */
export function dayKey(date: Date | string, opts: TimeOpts = {}): string {
  const ps = parts(
    new Date(date),
    { timeZone: opts.timeZone, locale: 'en-CA' },
    { year: 'numeric', month: '2-digit', day: '2-digit' },
  );
  return `${part(ps, 'year')}-${part(ps, 'month')}-${part(ps, 'day')}`;
}

/** Whole calendar days from day `a` to day `b`. */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function formatClock(date: Date | string, opts: TimeOpts = {}): string {
  return formatter(opts, { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function weekday(date: Date, opts: TimeOpts, style: 'long' | 'short') {
  return formatter(opts, { weekday: style }).format(date);
}

/** "Mon 12 Oct" (or "12 Oct"), with the year only when it isn't the current one. */
function shortDate(date: Date, now: Date, opts: TimeOpts, withWeekday: boolean) {
  const ps = parts(date, opts, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const sameYear = part(ps, 'year') === part(parts(now, opts, { year: 'numeric' }), 'year');
  return [
    withWeekday ? part(ps, 'weekday') : '',
    part(ps, 'day'),
    part(ps, 'month'),
    sameYear ? '' : part(ps, 'year'),
  ]
    .filter(Boolean)
    .join(' ');
}

export function dayLabel(date: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(date);
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return weekday(d, opts, 'long');
  return shortDate(d, now, opts, true);
}

export function formatLastSeen(at: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(at);
  if (now.getTime() - d.getTime() < MINUTE) return 'last seen just now';
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  const clock = formatClock(d, opts);
  if (diff <= 0) return `last seen today at ${clock}`;
  if (diff === 1) return `last seen yesterday at ${clock}`;
  if (diff < 7) return `last seen ${weekday(d, opts, 'long')} at ${clock}`;
  return `last seen ${shortDate(d, now, opts, false)}`;
}

export function formatRowTime(at: Date | string, now: Date, opts: TimeOpts = {}): string {
  const d = new Date(at);
  const diff = dayDiff(dayKey(d, opts), dayKey(now, opts));
  if (diff <= 0) return formatClock(d, opts);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return weekday(d, opts, 'short');
  return shortDate(d, now, opts, false);
}

export function formatUnread(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}
