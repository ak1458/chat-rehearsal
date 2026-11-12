import test from 'node:test';
import assert from 'node:assert/strict';
import { importConversation, displayTime } from '../lib/chat.ts';
import { readScreenshotText } from '../lib/screenshot-text.ts';
import { dateLabel, scheduleDrafts } from '../lib/timeline.ts';
import { findChatBounds, maskBubbleRows } from '../lib/screenshot-layout.ts';

test('imports Android and iPhone rows with names, clock formats and continuation lines', () => {
  const rows = importConversation('12/11/2026, 9:03 PM - Me: Pack a spare\nSecond line\n[12/11/2026, 21:04:00] Sam: Already packed.');
  assert.deepEqual(rows, [
    { sender: 'Me', text: 'Pack a spare\nSecond line', time: '21:03', date: '2026-11-12', outgoing: true },
    { sender: 'Sam', text: 'Already packed.', time: '21:04', date: '2026-11-12' },
  ]);
  assert.equal(displayTime('00:06', '12'), '12:06 AM');
});

test('keeps relative day headings and named times from pasted text', () => {
  const rows = importConversation('Yesterday\nMaya (11:56 PM): Still up?\nToday\n[12:03 AM] You: Yes', { today: '2026-11-12' });
  assert.deepEqual(rows, [
    { sender: 'Maya', text: 'Still up?', time: '23:56', date: '2026-11-11' },
    { sender: 'You', text: 'Yes', time: '00:03', date: '2026-11-12', outgoing: true },
  ]);
});

test('reads structured HTML speakers and semantic timestamps', () => {
  const rows = importConversation('<article class="message incoming"><span class="sender">Maya</span><time datetime="2026-11-11T21:20:00">9:20 PM</time><div class="message-text">First<br>Second</div></article>');
  assert.deepEqual(rows, [{ sender: 'Maya', text: 'First\nSecond', time: '21:20', date: '2026-11-11', outgoing: false }]);
});

test('uses different sender delays, rolls over midnight, and retains supplied timestamps', () => {
  const rows = scheduleDrafts([
    { text: 'One', outgoing: false }, { text: 'Two', outgoing: true },
    { text: 'Three', outgoing: false, date: '2026-11-12', time: '08:30' },
    { text: 'Four', outgoing: false },
  ], { auto: true, startDate: '2026-11-11', startTime: '23:57', receivedDelay: 3, sentDelay: 4 });
  assert.deepEqual(rows.map(({ date, time }) => [date, time]), [
    ['2026-11-11', '23:57'], ['2026-11-12', '00:01'], ['2026-11-12', '08:30'], ['2026-11-12', '08:33'],
  ]);
  assert.equal(dateLabel(rows[0].date, '2026-11-12'), 'Yesterday');
  assert.equal(dateLabel(rows[1].date, '2026-11-12'), 'Today');
});

test('keeps the last bubble out of a composer crop over same-color wallpaper', () => {
  const pixels = (x, y) => {
    if (y < 82) return [249, 249, 249];
    if (y >= 748 && y < 797 && x >= 197 && x < 379) return [214, 248, 198];
    return [236, 229, 220];
  };
  const bounds = findChatBounds(390, 844, pixels, [
    { text: 'Last message', x: 208, y: 760, width: 119, height: 16 },
    { text: 'Message', x: 43, y: 812, width: 59, height: 14 },
  ]);
  assert.ok(bounds.bodyBottom >= 797 && bounds.bodyBottom <= 812);
  assert.equal(bounds.keepFooter, false);
});

test('masks undetected bubble lettering inside a flat fill without masking nearby wallpaper', () => {
  const width = 100;
  const pixels = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) pixels.set(x < 12 || x > 60 ? [236, 229, 220, 255]
    : x >= 30 && x <= 32 ? [225, 217, 205, 255] : [255, 255, 255, 255], x * 4);
  const blocked = new Uint8Array(width);
  maskBubbleRows(width, 1, pixels, [[255, 255, 255]], blocked);
  assert.equal(blocked[31], 1);
  assert.equal(blocked[75], 0);
});

test('extracts supported HTML fields and excludes executable and external elements', () => {
  const rows = importConversation('<div data-sender="Sam" data-time="10:02" data-side="incoming">First<br>Second<script>alert(1)</script><img src="https://example.com/"></div><p>Me: Third</p>');
  assert.deepEqual(rows, [
    { sender: 'Sam', text: 'First\nSecond', time: '10:02', outgoing: false },
    { sender: 'Me', text: 'Third', outgoing: true },
  ]);
});

test('detects screenshot time and message sides while excluding the header and composer', () => {
  const lines = [
    { text: '9:41', x: 16, y: 12, width: 40, height: 12 },
    { text: 'Riya', x: 64, y: 49, width: 35, height: 16 },
    { text: 'Play it again 9:42', x: 20, y: 135, width: 150, height: 14 },
    { text: 'One more take 9:43', x: 210, y: 180, width: 167, height: 14 },
    { text: 'Message', x: 43, y: 765, width: 68, height: 14 },
  ];
  const result = readScreenshotText(lines, 390, 84, 748);
  assert.equal(result.clock, '09:41');
  assert.equal(result.name, 'Riya');
  assert.deepEqual(result.messages.map(({ text, outgoing }) => ({ text, outgoing })), [
    { text: 'Play it again', outgoing: false },
    { text: 'One more take', outgoing: true },
  ]);
});

test('ignores icon-shaped OCR fragments and prefers the larger contact title', () => {
  const result = readScreenshotText([
    { text: '9:41', x: 20, y: 10, width: 38, height: 13 },
    { text: 'rp', x: 39, y: 53, width: 20, height: 11 },
    { text: 'Riya Patel', x: 91, y: 44, width: 82, height: 17 },
    { text: 'online', x: 91, y: 63, width: 47, height: 10 },
    { text: '–', x: 30, y: 124, width: 8, height: 5 },
    { text: 'OK', x: 325, y: 143, width: 22, height: 13 },
  ], 390, 84, 748);
  assert.equal(result.name, 'Riya Patel');
  assert.deepEqual(result.messages.map(row => row.text), ['OK']);
});

test('recognizes a voice duration with waveform OCR noise as a voice placeholder', () => {
  const result = readScreenshotText([
    { text: '[ J 0:08', x: 212, y: 129, width: 146, height: 13 },
    { text: 'Fine 0:09', x: 20, y: 175, width: 66, height: 13 },
  ], 390, 84, 748);
  assert.deepEqual(result.messages, [
    { kind: 'voice', duration: '0:08', text: '', outgoing: true },
    { text: 'Fine', outgoing: false, time: '00:09' },
  ]);
});
