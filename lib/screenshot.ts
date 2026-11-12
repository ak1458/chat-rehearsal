import { readScreenshotText, type TextLine } from './screenshot-text';
import type { Draft, Phone } from './chat';
import { colorDistance as distance, findChatBounds, maskBubbleRows, type Color } from './screenshot-layout';

export type Reference = {
  source: string;
  status: string;
  header?: string;
  footer?: string;
  statusFraction: number;
  headerFraction: number;
  footerFraction: number;
};
export type Screenshot = { reference: Reference; phone: Partial<Phone>; messages: Draft[]; textFailed: boolean };

export function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Choose a readable PNG, JPEG or WebP image.'));
    image.src = source;
  });
}

export async function readAsset(file: File, kind: 'image' | 'audio') {
  if (!file.type.startsWith(kind + '/') || file.type === 'image/svg+xml') {
    throw new Error(kind === 'image' ? 'Choose a PNG, JPEG or WebP image.' : 'Choose an audio file.');
  }
  if (file.size > 18 * 1024 * 1024) throw new Error('Choose a file smaller than 18 MB.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

const hex = (rgb: Color) => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');

export async function scanScreenshot(file: File, progress: (label: string) => void): Promise<Screenshot> {
  const source = await readAsset(file, 'image');
  const image = await loadImage(source);
  const { naturalWidth, naturalHeight } = image;
  if (naturalWidth < 160 || naturalHeight < 280 || naturalWidth * naturalHeight > 32_000_000
    || naturalHeight < naturalWidth) {
    throw new Error('Choose a portrait screenshot between 160 × 280 and 32 megapixels.');
  }
  const canvas = document.createElement('canvas');
  const width = canvas.width = Math.min(960, Math.max(720, naturalWidth), Math.floor(4096 * naturalWidth / naturalHeight));
  const height = canvas.height = Math.round(naturalHeight * width / naturalWidth);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  function pixel(x: number, y: number): Color {
    const at = (Math.max(0, Math.min(height - 1, Math.floor(y))) * width
      + Math.max(0, Math.min(width - 1, Math.floor(x)))) * 4;
    return [pixels[at], pixels[at + 1], pixels[at + 2]];
  }
  function mode(colors: Color[]) {
    const bins = new Map<number, { count: number; color: Color }>();
    for (const color of colors) {
      const key = (color[0] >> 4) * 256 + (color[1] >> 4) * 16 + (color[2] >> 4);
      const bin = bins.get(key);
      if (bin) bin.count++;
      else bins.set(key, { count: 1, color });
    }
    return [...bins.values()].sort((a, b) => b.count - a.count)[0]?.color;
  }
  function textCanvas() {
    const rough = findChatBounds(width, height, pixel, []);
    const backdrop = mode([.018, .982].flatMap(x => [.38, .5, .64, .76].map(y => pixel(width * x, height * y)))) ?? rough.chrome;
    const bright = (color: Color) => (color[0] * 3 + color[1] * 6 + color[2]) / 10 >= 120;
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const painter = target.getContext('2d')!;
    const image = painter.createImageData(width, height);
    const bodyLight = bright(backdrop);
    const chromeLight = bright(rough.chrome);
    for (let y = 0, at = 0; y < height; y++) {
      const light = y >= rough.bodyTop && y < rough.bodyBottom ? bodyLight : chromeLight;
      for (let x = 0; x < width; x++, at += 4) {
        const gray = (pixels[at] * 3 + pixels[at + 1] * 6 + pixels[at + 2]) / 10;
        const exposed = ((light ? gray : 255 - gray) - 104) * 3.6;
        image.data[at] = image.data[at + 1] = image.data[at + 2] = exposed;
        image.data[at + 3] = 255;
      }
    }
    painter.putImageData(image, 0, 0);
    return target;
  }
  let lines: TextLine[] = [];
  let textFailed = false;
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined;
  try {
    progress('Loading text recognition…');
    const { createWorker, PSM } = await import('tesseract.js');
    const root = location.origin + (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/ocr';
    worker = await createWorker('eng', 1, {
      workerPath: root + '/worker.min.js', corePath: root, langPath: root,
      workerBlobURL: false,
      logger: message => {
        if (message.status === 'recognizing text') progress('Reading screenshot… ' + Math.round(message.progress * 100) + '%');
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(textCanvas(), {}, { blocks: true });
    lines = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => {
      const groups: { text: string[]; box: typeof line.bbox }[] = [];
      for (const word of line.words.filter(word => word.confidence >= 44 || /^\d{1,2}:\d{2}$/.test(word.text))) {
        const last = groups.at(-1);
        if (!last || word.bbox.x0 - last.box.x1 > width * .13) groups.push({ text: [word.text], box: { ...word.bbox } });
        else {
          last.text.push(word.text);
          last.box.x1 = word.bbox.x1;
          last.box.y0 = Math.min(last.box.y0, word.bbox.y0);
          last.box.y1 = Math.max(last.box.y1, word.bbox.y1);
        }
      }
      return groups.map(({ text, box }) => ({
        text: text.join(' '), x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0,
      }));
    })));
  } catch {
    textFailed = true;
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
  const { bodyTop, bodyBottom, chrome, keepHeader, keepFooter } = findChatBounds(width, height, pixel, lines);
  const background = mode(Array.from({ length: 126 }, (_, index) =>
    pixel(width * (index % 2 ? .02 : .98), bodyTop + (bodyBottom - bodyTop) * (index / 126)))) ?? chrome;
  const dark = (chrome[0] + chrome[1] + chrome[2]) / 3 < 105;
  function bubbleColor(line: TextLine) {
    return mode([-.006, .004, .012].flatMap(offset =>
      Array.from({ length: 11 }, (_, index) => pixel(line.x + line.width * index / 10, line.y + width * offset)),
    )) ?? background;
  }
  const text = readScreenshotText(lines, width, bodyTop, bodyBottom, line => {
    if (line.x < width * .12) return false;
    const color = bubbleColor(line);
    if (color[1] - color[0] > 13 && distance(color, background) > 25) return true;
    return undefined;
  });
  const statusBottom = Math.round(text.nameLine
    ? Math.min(bodyTop * .68, Math.max(bodyTop * .3, text.nameLine.y - width * .03))
    : bodyTop * .46);
  const bubble = (outgoing: boolean) => {
    const color = mode(text.entries.filter(entry => entry.draft.outgoing === outgoing)
      .map(entry => bubbleColor(entry.line)).filter(value => distance(value, background) > 22));
    return color;
  };
  const incoming = bubble(false);
  const outgoing = bubble(true);
  function crop(start: number, end: number) {
    const from = Math.round(start * naturalHeight / height);
    const to = Math.round(end * naturalHeight / height);
    const target = document.createElement('canvas');
    target.width = naturalWidth;
    target.height = Math.max(1, to - from);
    target.getContext('2d')!.drawImage(image, 0, from, naturalWidth, target.height, 0, 0, naturalWidth, target.height);
    return target.toDataURL('image/png');
  }
  function recoverWallpaper(): Partial<Phone> {
    const normalBase = dark ? [13, 20, 24] as const : [235, 228, 218] as const;
    const fallback = distance(background, normalBase) < 40 ? 'doodles' : 'solid';
    if (!lines.length) return { wallpaperStyle: fallback };
    const bodyHeight = bodyBottom - bodyTop;
    const blocked = new Uint8Array(bodyHeight * width);
    const presets: Color[] = dark ? [[32, 44, 51], [0, 92, 75]] : [[255, 255, 255], [217, 253, 211]];
    const rejectColors = [incoming ?? presets[0], outgoing ?? presets[1]].filter(color => distance(color, background) > 23);
    const first = bodyTop * width * 4;
    maskBubbleRows(width, bodyHeight, pixels.subarray(first, first + bodyHeight * width * 4), rejectColors, blocked);
    for (const line of lines) {
      if (line.y + line.height < bodyTop || line.y >= bodyBottom) continue;
      const margin = Math.max(width * .017, line.height * .47);
      const left = Math.max(0, Math.floor(line.x - margin));
      const right = Math.min(width, Math.ceil(line.x + line.width + margin));
      const top = Math.max(0, Math.floor(line.y - margin) - bodyTop);
      const bottom = Math.min(bodyHeight, Math.ceil(line.y + line.height + margin) - bodyTop);
      for (let y = top; y < bottom; y++) blocked.fill(1, y * width + left, y * width + right);
    }
    const target = document.createElement('canvas');
    target.width = width;
    target.height = bodyHeight;
    const paint = target.getContext('2d')!;
    const image = paint.createImageData(width, bodyHeight);
    let pattern = 0;
    for (let index = 0, at = 0; index < blocked.length; index++, at += 4) {
      const red = pixels[first + at] - background[0];
      const green = pixels[first + at + 1] - background[1];
      const blue = pixels[first + at + 2] - background[2];
      const delta = Math.abs(red) + Math.abs(green) + Math.abs(blue);
      const shade = red + green + blue;
      const accept = !blocked[index] && delta <= 72 && Math.max(red, green, blue) - Math.min(red, green, blue) < 22
        && (dark ? shade >= -8 : shade <= 8)
        && !rejectColors.some(color => Math.abs(pixels[first + at] - color[0]) + Math.abs(pixels[first + at + 1] - color[1])
          + Math.abs(pixels[first + at + 2] - color[2]) < 17);
      if (accept && delta > 7) pattern++;
      image.data[at] = accept ? pixels[first + at] : background[0];
      image.data[at + 1] = accept ? pixels[first + at + 1] : background[1];
      image.data[at + 2] = accept ? pixels[first + at + 2] : background[2];
      image.data[at + 3] = 255;
    }
    if (pattern < blocked.length * .002) return { wallpaperStyle: fallback };
    paint.putImageData(image, 0, 0);
    return { wallpaper: target.toDataURL('image/png'), wallpaperStyle: 'reference' };
  }
  function avatarFromScreenshot() {
    const name = text.nameLine;
    if (!keepHeader || !name || name.x < width * .15 || name.x > width * .33) return undefined;
    const size = Math.round(width * .09);
    const x = Math.round(name.x - width * .023 - size);
    const y = Math.round((statusBottom + bodyTop - size) / 2);
    const target = document.createElement('canvas');
    target.width = target.height = size;
    target.getContext('2d')!.drawImage(canvas, x, y, size, size, 0, 0, size, size);
    return target.toDataURL('image/png');
  }
  const glyphSizes = text.entries.map(entry => entry.line.height / width).sort((a, b) => a - b);
  const textSize = glyphSizes.length ? Math.max(3.1, Math.min(5.4, glyphSizes[Math.floor(glyphSizes.length / 2)] * 114)) : undefined;
  return {
    reference: {
      source, status: crop(0, statusBottom), header: keepHeader ? crop(statusBottom, bodyTop) : undefined,
      footer: keepFooter ? crop(bodyBottom, height) : undefined,
      statusFraction: statusBottom / height, headerFraction: (bodyTop - statusBottom) / height,
      footerFraction: (height - bodyBottom) / height,
    },
    phone: {
      width: naturalWidth, height: naturalHeight, theme: dark ? 'dark' : 'light',
      name: text.name || 'Imported chat', avatar: avatarFromScreenshot(),
      platform: keepHeader && bodyTop / width < .219 ? 'Android' : keepHeader && bodyTop / width > .26 ? 'iPhone' : undefined,
      background: hex(background), chrome: hex(chrome), incoming: incoming && hex(incoming), outgoing: outgoing && hex(outgoing),
      textSize, ...recoverWallpaper(),
      ...(text.clock ? { clock: text.clock } : {}), ...(text.format ? { format: text.format } : {}),
      ...(text.battery !== undefined ? { battery: text.battery } : {}),
    },
    messages: text.messages,
    textFailed,
  };
}
