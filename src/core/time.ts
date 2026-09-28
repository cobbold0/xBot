/** Start of the current day (00:00) in the given IANA timezone, as a UTC Date. */
export function startOfDay(tz: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset);
}

export function startOfMonth(tz: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  const d = startOfDay(tz, now);
  return new Date(d.getTime() - (day - 1) * 86_400_000 + 0); // DST shifts of ≤1h at month boundary are acceptable for budgeting
}
