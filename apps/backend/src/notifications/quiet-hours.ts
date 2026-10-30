const DAY_MINUTES = 24 * 60;

interface QuietHours {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string | null;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes since local midnight in `timeZone`. */
function localMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: 'hour' | 'minute') => Number(parts.find((p) => p.type === type)!.value);
  return part('hour') * 60 + part('minute');
}

/**
 * Milliseconds left until the quiet window [start, end) closes, or 0 when `now` is outside it.
 * start > end wraps past midnight (22:00–09:00); start == end is an empty window.
 */
export function quietHoursRemainingMs(s: QuietHours, now = new Date()): number {
  if (!s.quietHoursEnabled) return 0;
  const start = toMinutes(s.quietHoursStart);
  const end = toMinutes(s.quietHoursEnd);
  if (start === end) return 0;
  const cur = localMinutes(now, s.quietHoursTimezone ?? 'UTC');
  const inside = start < end ? cur >= start && cur < end : cur >= start || cur < end;
  if (!inside) return 0;
  // Zone offsets are whole minutes, so the seconds into the current minute match in every zone.
  const left = (end - cur + DAY_MINUTES) % DAY_MINUTES;
  return left * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
}
