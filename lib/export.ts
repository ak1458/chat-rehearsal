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
      pixelRatio: 1, skipAutoScale: true,
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
  const { getFontEmbedCSS } = await import('html-to-image');
  await document.fonts.ready;
  const fontStyles = await getFontEmbedCSS(phone);
  const clone = phone.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll('.empty-chat, .bubble-hit, .jump-to-latest').forEach(node => node.remove());
  clone.querySelectorAll('button').forEach(button => {
    const span = document.createElement('span');
    span.className = button.className;
    if (button.hasAttribute('data-export-decoration')) span.setAttribute('data-export-decoration', '');
    span.append(...button.childNodes);
    button.replaceWith(span);
  });
  const styles = [...document.styleSheets].flatMap(sheet => {
    try { return [...sheet.cssRules].filter(rule => !/^@font-face/i.test(rule.cssText)).map(rule => rule.cssText); }
    catch { return []; }
  }).join('\n');
  const documentText = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title data-export-decoration>Chat Rehearsal</title><style>' + (fontStyles + '\n' + styles).replace(/<\/style/gi, '<\\/style') +
    'body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:12px;background:#eeeaf8}' +
    '.phone{width:min(calc(100vw - 24px), ' + Math.min(480, width) + 'px, calc((100dvh - 24px) * var(--screen-ratio)));margin:0;border-radius:12px}' +
    '</style><body>' + clone.outerHTML + '</body></html>';
  download(new Blob([documentText], { type: 'text/html;charset=utf-8' }), 'chat-rehearsal.html');
}
