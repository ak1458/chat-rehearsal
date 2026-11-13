type LocalRule = { rule: CSSRule; base: string };

function localStyleRules(doc: Document): LocalRule[] {
  const origin = doc.location.origin;
  return [...doc.styleSheets].flatMap(sheet => {
    const base = sheet.href || doc.baseURI;
    if (sheet.disabled || (sheet.href && new URL(base).origin !== origin)) return [];
    try {
      return [...sheet.cssRules].map(rule => ({ rule, base }));
    } catch {
      return [];
    }
  });
}

async function inlineResource(url: URL) {
  const response = await fetch(url, { mode: 'same-origin' });
  if (!response.ok) throw new Error('Export asset unavailable.');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportFontStyles(phone: HTMLElement, styles: LocalRule[]) {
  const normalize = (family: string) => family.replace(/["']/g, '').trim().toLowerCase();
  const families = new Set(getComputedStyle(phone).fontFamily.split(',').map(normalize));
  const origin = phone.ownerDocument.location.origin;
  const fontRules = await Promise.all(styles.map(async ({ rule, base }) => {
    if (!(rule instanceof CSSFontFaceRule) || !families.has(normalize(rule.style.fontFamily))) return '';
    let css = rule.cssText;
    const sources = [...rule.style.getPropertyValue('src').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/g)];
    try {
      for (const source of sources) {
        const url = new URL(source[1] ?? source[2] ?? source[3], base);
        if (url.protocol === 'data:') continue;
        if (url.origin !== origin) return '';
        const data = await inlineResource(url);
        css = css.replace(source[0], 'url("' + data + '")');
      }
      return css;
    } catch {
      return '';
    }
  }));
  return fontRules.filter(Boolean).join('\n');
}

function download(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportPng(phone: HTMLDivElement, width: number, height: number) {
  const { toBlob } = await import('html-to-image');
  await document.fonts.ready;
  // Supplying the font CSS keeps html-to-image from enumerating protected stylesheets.
  const fontEmbedCSS = await exportFontStyles(phone, localStyleRules(phone.ownerDocument));
  const bounds = phone.getBoundingClientRect();
  const body = phone.querySelector<HTMLElement>('.phone-messages');
  const flow = phone.querySelector<HTMLElement>('.message-flow');
  const previousTransform = flow?.style.transform ?? '';
  const scroll = body?.scrollTop ?? 0;
  const previousOverflow = body?.style.overflow ?? '';
  if (body && flow) {
    body.style.overflow = 'clip';
    flow.style.transform = 'translateY(' + -scroll + 'px)';
  }
  try {
    const result = await toBlob(phone, {
      width: bounds.width, height: bounds.height, canvasWidth: width, canvasHeight: height,
      pixelRatio: 1, skipAutoScale: true, fontEmbedCSS,
      style: { borderRadius: '0', boxShadow: 'none', margin: '0' },
      filter: node => !node.matches?.('.empty-chat, .bubble-hit, .jump-to-latest'),
    });
    if (!result) throw new Error('The preview could not be saved.');
    download(result, 'chat-rehearsal.png');
  } finally {
    if (body && flow) {
      body.style.overflow = previousOverflow;
      flow.style.transform = previousTransform;
      body.scrollTop = scroll;
    }
  }
}

export async function exportHtml(phone: HTMLDivElement, width: number) {
  await document.fonts.ready;
  const localRules = localStyleRules(phone.ownerDocument);
  const fontStyles = await exportFontStyles(phone, localRules);
  const clone = phone.cloneNode(true) as HTMLDivElement;
  await Promise.all(['--wallpaper', '--chat-icons'].map(async property => {
    const resource = /^url\(["']?(\/[^"')]+)["']?\)$/.exec(clone.style.getPropertyValue(property).trim());
    if (!resource) return;
    try {
      const data = await inlineResource(new URL(resource[1], phone.ownerDocument.baseURI));
      clone.style.setProperty(property, 'url("' + data + '")');
    } catch {
      clone.style.removeProperty(property);
    }
  }));
  clone.querySelectorAll('.empty-chat, .bubble-hit, .jump-to-latest').forEach(node => node.remove());
  clone.querySelectorAll('button').forEach(button => {
    const span = document.createElement('span');
    span.className = button.className;
    if (button.hasAttribute('data-export-decoration')) span.setAttribute('data-export-decoration', '');
    span.append(...button.childNodes);
    button.replaceWith(span);
  });
  const styles = localRules.filter(({ rule }) => rule.type !== CSSRule.FONT_FACE_RULE && rule.type !== CSSRule.IMPORT_RULE)
    .map(({ rule }) => rule.cssText).join('\n');
  const documentText = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title data-export-decoration>Chat Rehearsal</title><style>' + (fontStyles + '\n' + styles).replace(/<\/style/gi, '<\\/style') +
    'body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:12px;background:#eeeaf8}' +
    '.phone{width:min(calc(100vw - 24px), ' + Math.min(480, width) + 'px, calc((100dvh - 24px) * var(--screen-ratio)));margin:0;border-radius:12px}' +
    '</style><body>' + clone.outerHTML + '</body></html>';
  download(new Blob([documentText], { type: 'text/html;charset=utf-8' }), 'chat-rehearsal.html');
}
