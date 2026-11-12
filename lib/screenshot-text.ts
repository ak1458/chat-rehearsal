import { normalizeTime, type Draft } from './chat.ts';
import { localDate, parseDay } from './timeline.ts';

export type TextLine = { text: string; x: number; y: number; width: number; height: number };
const clockPattern = /\b(\d{1,2}:[0-5]\d(?:\s*[AP]M)?)\b/i;
const trailingTime = /\s*(\d{1,2}:[0-5]\d(?:\s*[AP]M)?)\s*[✓✔√Vv»]*$/i;

export function readScreenshotText(lines: TextLine[], width: number, bodyTop: number, bodyBottom: number, sideOf?: (line: TextLine) => boolean | undefined) {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.filter(line => line.y < bodyTop);
  const clockLine = top.find(line => clockPattern.test(line.text));
  const clockText = clockLine?.text.match(clockPattern)?.[1];
  const clock = clockText ? normalizeTime(clockText) : undefined;
  const nameLine = top.filter(line => line !== clockLine && line.y > bodyTop * .34
    && line.x > width * .12 && line.x < width * .68 && /[\p{L}]{2}/u.test(line.text)
    && !/^(online|typing|last seen)\b/i.test(line.text))
    .sort((a, b) => b.height - a.height || b.width - a.width)[0];
  const name = nameLine?.text.trim();
  const battery = top.filter(line => line.x > width * .65 && line.y < bodyTop * .6)
    .map(line => line.text.match(/\b(\d{1,3})\s*%/)).find(Boolean)?.[1];
  const entries: { draft: Draft; line: TextLine; top: number; bottom: number; right: number }[] = [];
  const today = localDate();
  let activeDate: string | undefined;
  for (const line of sorted) {
    const raw = line.text.trim();
    if (line.y < bodyTop || line.y + line.height > bodyBottom || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(raw)) continue;
    if (Math.abs(line.x + line.width / 2 - width / 2) < width * .19) {
      const day = parseDay(raw, today);
      if (day) {
        activeDate = day;
        continue;
      }
    }
    if (/^(today|yesterday|unread messages)$/i.test(raw) ||
      /end.to.end encrypted|no one outside|tap to learn more/i.test(raw)) continue;
    const timeMatch = raw.match(trailingTime);
    const time = timeMatch ? normalizeTime(timeMatch[1]) : undefined;
    const text = timeMatch ? raw.slice(0, timeMatch.index).trim() : raw;
    const previous = entries.at(-1);
    const outgoing = sideOf?.(line) ?? (line.x > width * .16 && line.x + line.width * .6 > width * .49);
    const date = activeDate ? { date: activeDate } : {};
    const close = previous && previous.draft.date === activeDate &&
      line.y - previous.bottom < Math.max(line.height, previous.line.height) * .8;
    if (timeMatch && /^0:\d{2}$/.test(timeMatch[1]) && /[\[\]|]/.test(text) && !/[\p{L}\p{N}]{2}/u.test(text)) {
      entries.push({ draft: { kind: 'voice', duration: timeMatch[1], text: '', outgoing, ...date }, line,
        top: line.y, bottom: line.y + line.height, right: line.x + line.width });
      continue;
    }
    if (!text) {
      if (close && time) {
        previous.draft.time = time;
        previous.bottom = line.y + line.height;
        previous.right = Math.max(previous.right, line.x + line.width);
      }
      continue;
    }
    if (close && previous.draft.outgoing === outgoing && !previous.draft.time
      && Math.abs(previous.line.x - line.x) < width * .035) {
      previous.draft.text += '\n' + text;
      previous.draft.time = time;
      previous.bottom = line.y + line.height;
      previous.right = Math.max(previous.right, line.x + line.width);
      continue;
    }
    entries.push({ draft: { text, outgoing, ...date, ...(time ? { time } : {}) }, line,
      top: line.y, bottom: line.y + line.height, right: line.x + line.width });
  }
  return { clock, name, battery: battery && Number(battery) <= 100 ? Number(battery) : undefined,
    format: clockText && /[AP]M/i.test(clockText) ? '12' as const : undefined,
    messages: entries.map(entry => entry.draft), entries, nameLine };
}
