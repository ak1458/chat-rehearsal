import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { localDate, normalizeTime, parseDay } from './timeline.ts';
export { normalizeTime } from './timeline.ts';

export type Draft = { sender?: string; text: string; time?: string; date?: string; outgoing?: boolean; kind?: 'voice'; duration?: string };
export type Message = {
  id: string;
  sender: string;
  outgoing: boolean;
  text: string;
  time: string;
  date?: string;
  kind: 'text' | 'photo' | 'voice' | 'event';
  asset?: string;
  duration?: string;
  reaction?: string;
  receipt?: 'sent' | 'delivered' | 'read';
  reply?: string;
};
export type Phone = {
  platform: 'iPhone' | 'Android';
  theme: 'light' | 'dark';
  name: string;
  subtitle: string;
  avatar?: string;
  mode: 'direct' | 'group';
  clock: string;
  clockFormat?: '12' | '24';
  format: '12' | '24';
  battery: number;
  charging: boolean;
  signal: number;
  wifi: boolean;
  showStatus?: boolean;
  statusLayout?: 'device' | 'android-pill' | 'android-classic' | 'iphone';
  showBatteryPercent?: boolean;
  network?: '' | '4G' | '5G' | 'LTE';
  encryptionNotice?: boolean;
  width: number;
  height: number;
  wallpaper?: string;
  wallpaperStyle?: 'doodles' | 'solid' | 'reference';
  font?: 'auto' | 'system' | 'roboto' | 'inter' | 'noto' | 'arial';
  textSize?: number;
  background?: string;
  outgoing?: string;
  incoming?: string;
  chrome?: string;
};

export const defaultPhone: Phone = {
  platform: 'Android', theme: 'dark', name: 'Riya Patel', subtitle: '',
  mode: 'direct', clock: '09:41', format: '24', battery: 82, charging: false,
  signal: 4, wifi: true, width: 786, height: 1600,
};
export const demo: Message[] = [
  { id: 'a', sender: 'Riya Patel', outgoing: false, kind: 'text', time: '09:38', text: 'Be honest. How long have you been playing that same chord?' },
  { id: 'b', sender: 'You', outgoing: true, kind: 'text', time: '09:39', text: 'It’s called a motif.', receipt: 'read' },
  { id: 'c', sender: 'Riya Patel', outgoing: false, kind: 'text', time: '09:39', text: 'The neighbours are calling it a noise complaint.', reaction: '😂' },
  { id: 'd', sender: 'You', outgoing: true, kind: 'voice', time: '09:40', text: '', duration: '0:08', receipt: 'read' },
  { id: 'e', sender: 'Riya Patel', outgoing: false, kind: 'text', time: '09:41', text: 'Actually, that last bit was pretty good.' },
];

export function displayTime(value: string, format: Phone['format']) {
  const normalized = normalizeTime(value);
  if (!normalized || format === '24') return normalized ?? value;
  const [hour, minutes] = normalized.split(':');
  return (Number(hour) % 12 || 12) + ':' + minutes + (Number(hour) < 12 ? ' AM' : ' PM');
}

function speaker(sender: string) {
  return /^(you|me|self)$/i.test(sender) ? { outgoing: true } : {};
}

type ImportOptions = { today?: string; order?: 'dmy' | 'mdy' };
const numericDate = /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/;
const timePattern = /\d{1,2}:[0-5]\d(?::[0-5]\d)?(?:\s*[AP]M)?/i;

function readStamp(value: string, today: string, order?: ImportOptions['order']) {
  const dateText = value.match(numericDate)?.[0];
  const timeText = value.replace(/\u202f/g, ' ').match(timePattern)?.[0];
  return { date: dateText ? parseDay(dateText, today, order) : undefined,
    time: timeText ? normalizeTime(timeText) : undefined };
}

function parseText(source: string, options: ImportOptions, state: { date?: string } = {}) {
  const result: Draft[] = [];
  let continuation = false;
  let activeDate = state.date;
  const today = options.today ?? localDate();
  for (const input of source.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').split(/\r?\n/)) {
    const line = input.trim();
    if (!line) continue;
    const heading = parseDay(line.replace(/^[-–—\s]+|[-–—\s]+$/g, ''), today, options.order);
    if (heading) {
      activeDate = heading;
      continuation = false;
      continue;
    }
    const bracket = /^\[([^\]]+)\]\s*(.+)$/.exec(line);
    const dash = /^\s*(\d{1,4}[-./]\d{1,2}[-./]\d{1,4}.*?)(?:\s+-\s+)(.+)$/.exec(line);
    const bracketStamp = bracket ? readStamp(bracket[1], today, options.order) : undefined;
    const stamped = bracketStamp?.time ? bracket : dash;
    const stamp = stamped ? readStamp(stamped[1], today, options.order) : undefined;
    if (stamp?.date) activeDate = stamp.date;
    const body = stamped?.[2] ?? line;
    const timed = /^(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.+)$/i.exec(body);
    const authorTime = /^(.{1,64}?)\s*[([](\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[)\]]:\s*(.+)$/i.exec(timed?.[2] ?? body);
    const named = authorTime ? [authorTime[0], authorTime[1], authorTime[3]] : /^([^:\n]{1,64}):\s+(.+)$/.exec(timed?.[2] ?? body);
    const trailing = named ? /\s+\[(\d{1,2}:\d{2}(?:\s*[AP]M)?)\]$/i.exec(named[2]) : undefined;
    const time = stamp?.time ?? normalizeTime((timed?.[1] ?? authorTime?.[2] ?? trailing?.[1] ?? '').replace(/\u202f/g, ' '));
    const metadata = { ...(time ? { time } : {}), ...(activeDate ? { date: activeDate } : {}) };
    if (named) {
      const sender = named[1].trim();
      const text = trailing ? named[2].slice(0, trailing.index).trim() : named[2].trim();
      result.push({ sender, text, ...metadata, ...speaker(sender) });
    } else if (continuation && !stamped && !timed) {
      result[result.length - 1].text += '\n' + line;
      continue;
    } else {
      result.push({ text: timed?.[2] ?? body, ...metadata });
    }
    continuation = Boolean(stamped || (named && continuation));
  }
  state.date = activeDate;
  return result;
}

const ignored = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'head', 'img', 'audio', 'video']);
const blocks = new Set(['p', 'div', 'li', 'article', 'section', 'blockquote', 'tr', 'ul', 'ol', 'main']);
type Node = DefaultTreeAdapterMap['node'];

export function importConversation(source: string, options: ImportOptions = {}): Draft[] {
  if (!/<\/?[a-z][\w-]*(?:\s|\/?>)/i.test(source)) return parseText(source, options);
  const today = options.today ?? localDate();
  const rows: Draft[] = [];
  const state: { date?: string } = {};
  let pending = '';
  function flush() {
    rows.push(...parseText(pending, options, state));
    pending = '';
  }
  const attributes = (node: Node) => 'attrs' in node ? Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value])) : {};
  const hasClass = (node: Node, pattern: RegExp) => (attributes(node).class ?? '').split(/\s+/).some(name => pattern.test(name));
  function child(node: Node, matches: (node: Node) => boolean): Node | undefined {
    if (!('childNodes' in node)) return undefined;
    for (const item of node.childNodes) {
      if ('tagName' in item && ignored.has(item.tagName)) continue;
      if (matches(item)) return item;
      const nested = child(item, matches);
      if (nested) return nested;
    }
  }
  function plain(node: Node): string {
    if ('value' in node) return node.value;
    if ('tagName' in node && ignored.has(node.tagName)) return '';
    if ('attrs' in node && node.attrs.some(attr => attr.name === 'data-export-decoration')) return '';
    if (node.nodeName === 'br') return '\n';
    const content = 'childNodes' in node ? node.childNodes.map(plain).join('') : '';
    return blocks.has(node.nodeName) ? content + '\n' : content;
  }
  function visit(node: Node) {
    if ('value' in node) {
      pending += node.value;
      return;
    }
    if ('tagName' in node && ignored.has(node.tagName)) return;
    if (node.nodeName === 'br') {
      pending += '\n';
      return;
    }
    if ('attrs' in node) {
      const attrs = attributes(node);
      if ('data-export-decoration' in attrs) return;
      const pre = attrs['data-pre-plain-text']?.match(/^\[([^\]]+)\]\s*(.+?):\s*$/);
      const explicit = 'data-sender' in attrs || 'data-side' in attrs || 'data-time' in attrs || 'data-date' in attrs || pre;
      const structured = hasClass(node, /^(?:message|chat-message|message-row|message-in|message-out|msg)$/i);
      const author = structured ? child(node, item => hasClass(item, /^(?:sender|author|username|sender-name|message-author)$/i)) : undefined;
      const timestamp = structured ? child(node, item => item.nodeName === 'time' || hasClass(item, /^(?:time|timestamp|message-time)$/i)) : undefined;
      const content = structured ? child(node, item => hasClass(item, /^(?:text|content|message-text|message-body|msg-text|bubble-text)$/i)) : undefined;
      if (explicit || (structured && (author || timestamp) && content)) {
        flush();
        const text = plain(content ?? node).trim();
        const timeAttr = attrs['data-time'] || pre?.[1] || (timestamp ? attributes(timestamp).datetime || plain(timestamp) : '');
        const stamp = readStamp(timeAttr, today, options.order);
        const date = parseDay(attrs['data-date'] ?? '', today, options.order) ?? stamp.date ?? state.date;
        state.date = date;
        const sender = attrs['data-sender']?.trim() || pre?.[2] || (author ? plain(author).trim() : '');
        const side = attrs['data-side'] || (hasClass(node, /^(?:incoming|message-in)$/i) ? 'incoming'
          : hasClass(node, /^(?:outgoing|message-out)$/i) ? 'outgoing' : '');
        if (text) rows.push({ text, ...(sender ? { sender } : {}), ...(stamp.time ? { time: stamp.time } : {}), ...(date ? { date } : {}),
          ...(['incoming', 'outgoing'].includes(side) ? { outgoing: side === 'outgoing' } : speaker(sender ?? '')) });
        return;
      }
    }
    const block = blocks.has(node.nodeName);
    if (block) flush();
    if ('childNodes' in node) node.childNodes.forEach(visit);
    if (block) flush();
  }
  visit(parseFragment(source));
  flush();
  return rows;
}
