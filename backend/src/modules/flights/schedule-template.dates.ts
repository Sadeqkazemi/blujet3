/**
 * Pure date helpers for seasonal schedule templates.
 * Weekdays: ISO 1=Mon … 7=Sun.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse YYYY-MM-DD as a UTC calendar date (no TZ shift). */
export function parseUtcDateOnly(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`invalid date: ${isoDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function formatUtcDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** UTC getUTCDay(): 0=Sun … 6=Sat → ISO 1=Mon … 7=Sun */
export function utcIsoWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export function enumerateMatchingDates(
  startDate: string,
  endDate: string,
  weekdays: number[],
): string[] {
  const start = parseUtcDateOnly(startDate);
  const end = parseUtcDateOnly(endDate);
  if (end.getTime() < start.getTime()) return [];
  const wanted = new Set(weekdays);
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    const d = new Date(t);
    if (wanted.has(utcIsoWeekday(d))) {
      out.push(formatUtcDateOnly(d));
    }
  }
  return out;
}

/**
 * Convert a local civil date+HH:mm in an IANA zone to a UTC Date.
 * Uses iterative search against Intl so we do not pull a TZ library.
 */
export function zonedLocalToUtc(
  dateOnly: string,
  hhmm: string,
  timeZone: string,
): Date {
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!tm) throw new Error(`invalid time: ${hhmm}`);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const [y, mo, d] = dateOnly.split('-').map(Number);
  // Initial guess: treat as UTC then correct.
  let guess = Date.UTC(y, mo - 1, d, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      0,
    );
    const target = Date.UTC(y, mo - 1, d, hour, minute, 0);
    const delta = target - asUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}
