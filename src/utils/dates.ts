const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Google Tasks stores due dates as date-only values encoded as midnight UTC
 * (e.g. "2026-10-22T00:00:00.000Z"). Parsing them with `new Date()` shifts the
 * day backwards in timezones west of UTC (Argentina shows the 21st), so we
 * always read the first 10 characters as a calendar date.
 */
export function dueToYmd(dueIso?: string): string | undefined {
  if (!dueIso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueIso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function localDateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converts a calendar date into the RFC 3339 value Google Tasks expects. */
export function ymdToGoogleDue(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

/** Calendar days from today until the due date (negative when overdue). */
export function daysUntilDue(dueIso?: string, nowMs = Date.now()): number | undefined {
  const ymd = dueToYmd(dueIso);
  if (!ymd) return undefined;
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((ymdToLocalDate(ymd).getTime() - today.getTime()) / DAY_MS);
}

export function formatDueLabel(dueIso?: string, nowMs = Date.now()): string {
  const days = daysUntilDue(dueIso, nowMs);
  if (days === undefined) return 'Sin fecha';
  if (days < -1) return `Vencida hace ${-days} días`;
  if (days === -1) return 'Venció ayer';
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  if (days < 7) {
    const weekday = ymdToLocalDate(dueToYmd(dueIso)!).toLocaleDateString('es-AR', { weekday: 'long' });
    return `Vence el ${weekday}`;
  }
  const date = ymdToLocalDate(dueToYmd(dueIso)!);
  return `Vence ${date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
}

export function addDays(base: Date, days: number): Date {
  const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
