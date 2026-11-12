export type Timing = {
  auto: boolean;
  startDate: string;
  startTime: string;
  receivedDelay: number;
  sentDelay: number;
};

export function normalizeTime(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return undefined;
  let hour = Number(match[1]);
  if (hour > 23 || (match[3] && (hour < 1 || hour > 12))) return undefined;
  if (match[3]) hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return String(hour).padStart(2, '0') + ':' + match[2];
}

export function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part, index) =>
    String(part).padStart(index ? 2 : 4, '0')).join('-');
}

export function addDays(iso: string, days: number) {
  const date = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateLabel(iso: string | undefined, today: string) {
  if (!iso || iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const day = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(day.getTime()) ? iso : new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: iso.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC',
  }).format(day);
}

export function parseDay(value: string, today: string, order: 'dmy' | 'mdy' = 'dmy') {
  const text = value.trim();
  if (/^today$/i.test(text)) return today;
  if (/^yesterday$/i.test(text)) return addDays(today, -1);
  const numeric = /^(\d{1,4})[-./](\d{1,2})[-./](\d{1,4})$/.exec(text);
  if (!numeric) {
    if (!/^(?:\d{1,2}\s+[a-z]{3,9}|[a-z]{3,9}\s+\d{1,2})(?:,?\s+\d{4})?$/i.test(text)) return undefined;
    const parsed = new Date((/\d{4}$/.test(text) ? text : text + ' ' + today.slice(0, 4)) + ' UTC');
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  }
  const [, a, b, c] = numeric;
  const [year, month, day] = a.length === 4 ? [a, b, c] :
    order === 'mdy' && Number(a) <= 12 ? [c, a, b] :
    Number(b) > 12 && Number(a) <= 12 ? [c, a, b] : [c, b, a];
  const fullYear = year.length === 2 ? (Number(year) >= 70 ? '19' : '20') + year : year;
  const iso = fullYear.padStart(4, '0') + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
  return addDays(iso, 0) === iso && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso) ? iso : undefined;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function scheduleDrafts<T extends { date?: string; time?: string; outgoing?: boolean }>(
  drafts: T[], timing: Timing, last?: { date?: string; time: string },
): (T & { date: string; time: string })[] {
  const startTime = normalizeTime(timing.startTime) || '09:00';
  let previous = last ? { date: last.date || timing.startDate, time: normalizeTime(last.time) || startTime } : undefined;
  return drafts.map(draft => {
    let date = draft.date || previous?.date || timing.startDate;
    let time = normalizeTime(draft.time ?? '');
    if (time && !draft.date && timing.auto && previous && minutes(previous.time) >= 18 * 60 && minutes(time) < 6 * 60) {
      date = addDays(date, 1);
    }
    if (!time && timing.auto && previous && date === previous.date) {
      const delay = Math.max(0, Math.min(1440, Math.round(draft.outgoing ? timing.sentDelay : timing.receivedDelay) || 0));
      const next = minutes(previous.time) + delay;
      const clock = draft.date ? Math.min(1439, next) : next;
      date = addDays(date, Math.floor(clock / 1440));
      time = String(Math.floor(clock / 60) % 24).padStart(2, '0') + ':' + String(clock % 60).padStart(2, '0');
    }
    time ||= startTime;
    previous = { date, time };
    return { ...draft, date, time };
  });
}
