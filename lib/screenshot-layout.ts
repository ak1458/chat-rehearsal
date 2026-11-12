import type { TextLine } from './screenshot-text.ts';

export type Color = readonly [number, number, number];
export const colorDistance = (a: Color, b: Color) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

export function findChatBounds(width: number, height: number, pixel: (x: number, y: number) => Color, lines: TextLine[]) {
  const depth = Math.max(3, Math.round(width * .014));
  const edge = [.037, .075, .925, .963];
  const rowDiffers = (y: number, color: Color) =>
    edge.filter(x => colorDistance(pixel(width * x, y), color) > 21).length >= 3;
  function transition(color: Color, start: number, end: number, step: number) {
    for (let y = Math.round(start); step > 0 ? y < end : y > end; y += step) {
      if (rowDiffers(y, color) && rowDiffers(y + step * depth, color)
        && !rowDiffers(y - step * depth, color)) return step > 0 ? y : y + 1;
    }
    return undefined;
  }
  const samples = [.018, .046, .954, .982].flatMap(x => [.122, .148, .173].map(y => pixel(width * x, width * y)));
  samples.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  const chrome = samples[Math.floor(samples.length / 2)];
  const headerEdge = transition(chrome, width * .155, width * .36, 1);
  const bodyTop = headerEdge ?? Math.round(width * .235);
  const composer = lines.find(line => line.y >= height - width * .30 && line.y < height - width * .02
    && line.x < width * .47 && /^(message|type a message|enter message)$/i.test(line.text.trim()));
  const footerColor = pixel(width * .065, height - width * .052);
  const footerEdge = transition(footerColor, height - width * .072, height - width * .29, -1);
  const plausibleFooter = footerEdge !== undefined && (!composer || (footerEdge < composer.y
    && composer.y - footerEdge < width * .105));
  const bodyBottom = plausibleFooter ? footerEdge : composer
    ? Math.round(composer.y - width * .031) : Math.round(height - width * .095);
  return { bodyTop, bodyBottom, chrome, keepHeader: headerEdge !== undefined, keepFooter: plausibleFooter };
}

export function maskBubbleRows(width: number, height: number, source: Uint8ClampedArray, colors: Color[], blocked: Uint8Array) {
  const gap = Math.max(4, Math.round(width * .023));
  const minimum = Math.max(9, Math.round(width * .045));
  const padding = Math.max(2, Math.round(width * .005));
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (const color of colors) {
      let start = -1;
      let previous = -1;
      let count = 0;
      function flush() {
        if (count < minimum) return;
        blocked.fill(1, row + Math.max(0, start - padding), row + Math.min(width, previous + padding + 1));
      }
      for (let x = 0; x < width; x++) {
        const at = (row + x) * 4;
        if (Math.abs(source[at] - color[0]) + Math.abs(source[at + 1] - color[1]) + Math.abs(source[at + 2] - color[2]) > 21) continue;
        if (start < 0 || x - previous > gap) {
          flush();
          start = x;
          count = 0;
        }
        previous = x;
        count++;
      }
      flush();
    }
  }
}
