import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, formatLastSeen, formatRowTime, formatUnread } from './time';

const utc = { timeZone: 'UTC', locale: 'en-GB' };
// 2026-10-15 is a Thursday.
const now = new Date('2026-10-15T20:00:00Z');

describe('dayLabel', () => {
  it('names today, yesterday and the last week, then short dates', () => {
    expect(dayLabel('2026-10-15T09:00:00Z', now, utc)).toBe('Today');
    expect(dayLabel('2026-10-14T23:30:00Z', now, utc)).toBe('Yesterday');
    expect(dayLabel('2026-10-12T10:00:00Z', now, utc)).toBe('Monday');
    expect(dayLabel('2026-10-05T10:00:00Z', now, utc)).toBe('Mon 5 Oct');
    expect(dayLabel('2025-12-30T10:00:00Z', now, utc)).toBe('Tue 30 Dec 2025');
  });

  it('uses the reader’s time zone for the day boundary', () => {
    const noon = new Date('2026-10-15T12:00:00Z');
    expect(dayLabel('2026-10-14T23:30:00Z', noon, { ...utc, timeZone: 'UTC' })).toBe('Yesterday');
    expect(dayLabel('2026-10-14T23:30:00Z', noon, { ...utc, timeZone: 'Asia/Kolkata' })).toBe(
      'Today',
    );
  });

  it('keeps one calendar day across the US daylight-saving change', () => {
    const ny = { timeZone: 'America/New_York', locale: 'en-GB' };
    // 2026-11-01 01:30 EDT and 01:30 EST are both on 1 November.
    expect(dayKey('2026-11-01T05:30:00Z', ny)).toBe('2026-11-01');
    expect(dayKey('2026-11-01T06:30:00Z', ny)).toBe('2026-11-01');
    expect(dayLabel('2026-11-01T06:30:00Z', new Date('2026-11-02T15:00:00Z'), ny)).toBe(
      'Yesterday',
    );
  });
});

describe('formatLastSeen', () => {
  const at = new Date('2026-10-15T14:05:30Z');
  it('words recent activity like a messenger', () => {
    expect(formatLastSeen('2026-10-15T14:05:00Z', at, utc)).toBe('last seen just now');
    expect(formatLastSeen('2026-10-15T09:12:00Z', at, utc)).toBe('last seen today at 09:12');
    expect(formatLastSeen('2026-10-14T18:40:00Z', at, utc)).toBe('last seen yesterday at 18:40');
    expect(formatLastSeen('2026-10-12T18:40:00Z', at, utc)).toBe('last seen Monday at 18:40');
    expect(formatLastSeen('2026-10-01T10:00:00Z', at, utc)).toBe('last seen 1 Oct');
    expect(formatLastSeen('2025-10-01T10:00:00Z', at, utc)).toBe('last seen 1 Oct 2025');
  });
});

describe('formatRowTime', () => {
  it('shows a clock today, then Yesterday, weekday, date', () => {
    expect(formatRowTime('2026-10-15T09:12:00Z', now, utc)).toBe('09:12');
    expect(formatRowTime('2026-10-14T09:12:00Z', now, utc)).toBe('Yesterday');
    expect(formatRowTime('2026-10-12T09:12:00Z', now, utc)).toBe('Mon');
    expect(formatRowTime('2026-10-01T09:12:00Z', now, utc)).toBe('1 Oct');
  });
});

describe('formatUnread', () => {
  it('caps at 99+ and hides zero', () => {
    expect(formatUnread(0)).toBe('');
    expect(formatUnread(5)).toBe('5');
    expect(formatUnread(99)).toBe('99');
    expect(formatUnread(100)).toBe('99+');
  });
});
