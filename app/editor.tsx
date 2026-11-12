'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ChevronDown, ChevronRight, Clipboard, CodeXml, ImagePlus, MessageCircle, MessagesSquare, Plus, Settings2, Smartphone, Trash2, Upload, X } from 'lucide-react';
import { defaultPhone, demo, importConversation, type Draft, type Message, type Phone } from '../lib/chat';
import { readAsset, scanScreenshot, type Reference, type Screenshot } from '../lib/screenshot';
import { exportHtml, exportPng } from '../lib/export';
import { PhonePreview, type Preserve } from './phone-preview';
import { addDays, dateLabel, localDate, scheduleDrafts, type Timing } from '../lib/timeline';

const noSlices = { status: false, header: false, footer: false };
const icons = { text: MessageCircle, photo: ImagePlus, voice: MessagesSquare, event: CodeXml };
const acceptImage = 'image/png,image/jpeg,image/webp,image/avif,image/bmp';
const id = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={close} onClick={event => {
    if (event.target === event.currentTarget) close();
  }}><div className="dialog-inner">
    <div className="dialog-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={19} /></button></div>
    {children}
  </div></dialog>;
}

export default function Editor() {
  const [phone, setPhone] = useState<Phone>(defaultPhone);
  const [messages, setMessages] = useState<Message[]>(demo);
  const [reference, setReference] = useState<Reference>();
  const [preserve, setPreserve] = useState<Preserve>(noSlices);
  const [original, setOriginal] = useState(false);
  const [selectedId, setSelectedId] = useState(demo[0].id);
  const [tab, setTab] = useState<'chat' | 'phone'>('chat');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<Screenshot>();
  const [importOpen, setImportOpen] = useState(false);
  const [script, setScript] = useState('');
  const [ownName, setOwnName] = useState('');
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [omitted, setOmitted] = useState<Set<number>>(new Set());
  const [dateOrder, setDateOrder] = useState<'dmy' | 'mdy'>('dmy');
  const [replace, setReplace] = useState(false);
  const [today, setToday] = useState('');
  const [dateEdit, setDateEdit] = useState<{ messageId: string; value: string }>();
  const [timing, setTiming] = useState<Timing>({ auto: true, startDate: '', startTime: '09:00', receivedDelay: 3, sentDelay: 4 });
  const [exportMenu, setExportMenu] = useState(false);
  const [drop, setDrop] = useState(false);
  const dragDepth = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const scrollNext = useRef(false);
  const running = useRef(false);
  const index = messages.findIndex(message => message.id === selectedId);
  const selected = messages[index];

  useEffect(() => { setToday(localDate()); }, []);

  useEffect(() => {
    if (scrollNext.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      scrollNext.current = false;
    }
  }, [messages, original]);

  function setScreen<K extends keyof Phone>(key: K, value: Phone[K]) {
    setOriginal(false);
    setPhone(current => ({ ...current, [key]: value }));
    if (key === 'wallpaper') setPhone(current => ({ ...current, wallpaperStyle: undefined }));
    if (['clock', 'format', 'battery', 'charging', 'signal', 'wifi'].includes(key)) {
      setPreserve(current => ({ ...current, status: false }));
    }
    if (['name', 'subtitle', 'mode', 'avatar'].includes(key)) {
      setPreserve(current => ({ ...current, header: false }));
    }
    if (key === 'platform' || key === 'theme') {
      setPreserve(noSlices);
      setPhone(current => ({ ...current, chrome: undefined, background: undefined, incoming: undefined, outgoing: undefined,
        ...(current.wallpaperStyle === 'reference' ? { wallpaperStyle: undefined, wallpaper: undefined } : {}) }));
    }
  }

  function select(messageId: string, reveal = true) {
    setSelectedId(messageId);
    setOriginal(false);
    if (reveal && window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }

  function add() {
    const messageId = id();
    scrollNext.current = true;
    setMessages(current => {
      const last = current.at(-1);
      const outgoing = !last?.outgoing;
      const [draft] = scheduleDrafts([{ outgoing }], { ...timing, startDate: timing.startDate || today || localDate() }, last);
      return [...current, { id: messageId, sender: outgoing ? 'You' : phone.name, kind: 'text', outgoing,
        text: 'New message', time: draft.time, date: draft.date, receipt: 'read' }];
    });
    select(messageId);
  }

  function changeMessage(update: Partial<Message>) {
    setOriginal(false);
    setMessages(current => current.map(message => message.id === selectedId ? { ...message, ...update } : message));
  }

  function editDate(messageId: string) {
    const message = messages.find(item => item.id === messageId);
    if (message) setDateEdit({ messageId, value: message.date || today || localDate() });
  }

  function applyDate() {
    if (!dateEdit?.value) return;
    const currentDay = today || localDate();
    setMessages(current => {
      const start = current.findIndex(message => message.id === dateEdit.messageId);
      if (start < 0) return current;
      const oldDate = current[start].date || currentDay;
      let end = start + 1;
      while (end < current.length && (current[end].date || currentDay) === oldDate) end++;
      return current.map((message, position) =>
        position >= start && position < end ? { ...message, date: dateEdit.value } : message);
    });
    setDateEdit(undefined);
  }

  function move(offset: number) {
    const next = index + offset;
    if (index < 0 || next < 0 || next >= messages.length) return;
    const reordered = [...messages];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setMessages(reordered);
  }

  function remove() {
    const remaining = messages.filter(message => message.id !== selectedId);
    setMessages(remaining);
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? '');
  }

  function prepareMessages(drafts: Draft[], screen: Phone, last?: Message, importedFromScreenshot = false) {
    const identities = [...new Set(drafts.map(row => row.sender?.trim()).filter((name): name is string => Boolean(name)))];
    const self = ownName.trim().toLowerCase() || (!drafts.some(row => row.outgoing === true) && identities.length === 2
      ? identities[0].toLowerCase() : '');
    const assigned = drafts.map((row, position) => {
      const outgoing = row.outgoing ?? (row.sender
        ? row.sender.trim().toLowerCase() === self
        : position % 2 === 1);
      return { ...row, sender: row.sender || (outgoing ? 'You' : screen.name), outgoing };
    });
    return scheduleDrafts(assigned, { ...timing, startDate: timing.startDate || today || localDate(),
      startTime: importedFromScreenshot ? screen.clock : timing.startTime }, last);
  }

  function makeMessages(drafts: ReturnType<typeof prepareMessages>): Message[] {
    return drafts.map(row => ({ ...row, id: id(), kind: row.kind ?? 'text', receipt: 'read' }));
  }

  const reviewed = rows ? prepareMessages(rows.filter((_, position) => !omitted.has(position)), phone,
    replace ? undefined : messages.at(-1)) : [];
  async function startScan(file?: File) {
    if (!file || running.current) return;
    running.current = true;
    setNotice('');
    setBusy('Preparing screenshot…');
    try {
      setPending(await scanScreenshot(file, setBusy));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The screenshot could not be read.');
    } finally {
      setBusy('');
      running.current = false;
    }
  }

  function applyScreenshot(useMessages: boolean) {
    if (!pending) return;
    const next = { ...defaultPhone, ...pending.phone, name: pending.phone.name || phone.name,
      platform: pending.phone.platform ?? phone.platform };
    setPhone(next);
    setReference(pending.reference);
    setPreserve({ status: Boolean(pending.reference.status), header: Boolean(pending.reference.header), footer: Boolean(pending.reference.footer) });
    setOriginal(false);
    if (useMessages) {
      const imported = makeMessages(prepareMessages(pending.messages, next, undefined, true));
      setMessages(imported);
      setSelectedId(imported[0]?.id ?? '');
      if (messagesRef.current) messagesRef.current.scrollTop = 0;
    }
    setPending(undefined);
    setNotice('Reference applied. Use Original to compare.');
  }

  async function asset(event: ChangeEvent<HTMLInputElement>, type: 'image' | 'audio', apply: (url: string) => void) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { apply(await readAsset(file, type)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The file could not be read.'); }
  }

  async function save(format: 'png' | 'html') {
    setExportMenu(false);
    if (!previewRef.current || running.current || original) return;
    running.current = true;
    setBusy('Preparing export…');
    setNotice('');
    try {
      if (format === 'png') await exportPng(previewRef.current, phone.width, phone.height);
      else await exportHtml(previewRef.current, phone.width);
      setNotice(format.toUpperCase() + ' downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export failed. Try again.');
    } finally {
      running.current = false;
      setBusy('');
    }
  }

  return <div className="studio">
    <header className="app-header">
      <div className="brand"><span className="brand-icon"><MessagesSquare size={23} /></span><div><h1>Chat Rehearsal</h1><span>WhatsApp chat maker</span></div></div>
      <div className="header-actions">
        <input type="file" accept={acceptImage} ref={uploadRef} hidden aria-label="Screenshot file" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''; void startScan(file);
        }} />
        <button className="btn secondary upload-btn" onClick={() => uploadRef.current?.click()} disabled={Boolean(busy)}
          aria-label="Upload screenshot"><Upload size={17} /><span className="desktop-upload">Upload screenshot</span><span className="mobile-upload">Upload</span></button>
        <div className="export-control">
          <button className="btn primary" onClick={() => setExportMenu(value => !value)} disabled={Boolean(busy) || original}
            aria-expanded={exportMenu}><ArrowDownToLine size={17} /> Export <ChevronDown size={15} /></button>
          {exportMenu && <><button className="menu-scrim" aria-label="Close export menu" onClick={() => setExportMenu(false)} />
            <div className="export-menu"><button onClick={() => void save('png')}>Download PNG</button><button onClick={() => void save('html')}>Download HTML</button></div></>}
        </div>
      </div>
    </header>
    {(busy || notice) && <div className="notice" role="status"><span>{busy || notice}</span>
      {!busy && <button className="icon-btn" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button>}</div>}
    <main className="workbench">
      <aside className="left-panel" aria-label="Chat editor">
        <div className="panel-tabs" role="group" aria-label="Editor sections">
          <button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={17} /> Conversation</button>
          <button aria-pressed={tab === 'phone'} onClick={() => setTab('phone')}><Smartphone size={17} /> Screen</button>
        </div>
        {tab === 'chat' ? <>
          <div className="panel-section chat-actions">
            <button className="btn add-btn" onClick={add}><Plus size={18} /> Add message</button>
            <button className="btn secondary" onClick={() => { setRows(null); setOmitted(new Set()); setReplace(false); setImportOpen(true); }}><Clipboard size={17} /> Paste chat</button>
          </div>
          <details className="timing-settings">
            <summary><Settings2 size={16} /> Message timing <ChevronDown size={15} /></summary>
            <div className="timing-fields">
              <label className="check"><input type="checkbox" checked={timing.auto}
                onChange={event => setTiming(current => ({ ...current, auto: event.target.checked }))} /> Add delays to untimed messages</label>
              <div className="two-fields">
                <Field label="Start date"><input type="date" value={timing.startDate || today}
                  onChange={event => setTiming(current => ({ ...current, startDate: event.target.value }))} /></Field>
                <Field label="Start time"><input type="time" value={timing.startTime}
                  onChange={event => setTiming(current => ({ ...current, startTime: event.target.value }))} /></Field>
                <Field label="Received delay (min)"><input type="number" min="0" max="1440" disabled={!timing.auto} value={timing.receivedDelay}
                  onChange={event => setTiming(current => ({ ...current, receivedDelay: Number(event.target.value) }))} /></Field>
                <Field label="Sent delay (min)"><input type="number" min="0" max="1440" disabled={!timing.auto} value={timing.sentDelay}
                  onChange={event => setTiming(current => ({ ...current, sentDelay: Number(event.target.value) }))} /></Field>
              </div>
            </div>
          </details>
          <div className="list-head"><h2>Messages</h2><span>{messages.length}</span></div>
          <div className="message-list">
            {messages.map(message => {
              const Icon = icons[message.kind];
              return <button key={message.id} className={'message-item' + (message.id === selectedId ? ' active' : '')}
                aria-pressed={message.id === selectedId} onClick={() => select(message.id)}>
                <span className={'message-icon' + (message.outgoing ? ' outgoing-icon' : '')}><Icon size={17} /></span>
                <span className="message-label"><strong>{message.sender}</strong><span>{message.text || (message.kind === 'voice' ? 'Voice note' : 'Photo')}</span></span>
                <ChevronRight size={15} />
              </button>;
            })}
            {messages.length === 0 && <p className="subtle empty-list">Add a message or paste a conversation.</p>}
          </div>
        </> : <div className="panel-section phone-fields">
          <h2>Screen settings</h2>
          <div className="two-fields">
            <Field label="Device"><select value={phone.platform} onChange={event => setScreen('platform', event.target.value as Phone['platform'])}><option>iPhone</option><option>Android</option></select></Field>
            <Field label="Appearance"><select value={phone.theme} onChange={event => setScreen('theme', event.target.value as Phone['theme'])}><option value="light">Light</option><option value="dark">Dark</option></select></Field>
          </div>
          <Field label="Conversation"><select value={phone.mode} onChange={event => setScreen('mode', event.target.value as Phone['mode'])}><option value="direct">One-to-one</option><option value="group">Group chat</option></select></Field>
          <div className="two-fields">
            <Field label="Chat font"><select value={phone.font ?? 'auto'} onChange={event => setScreen('font', event.target.value as Phone['font'])}>
              <option value="auto">Match device</option><option value="system">System</option><option value="roboto">Roboto</option>
              <option value="inter">Inter</option><option value="noto">Noto Sans</option><option value="arial">Arial</option>
            </select></Field>
            <Field label="Text size"><input type="range" min="2.8" max="6.5" step=".1" value={phone.textSize ?? 3.8}
              onChange={event => setScreen('textSize', Number(event.target.value))} /></Field>
          </div>
          <Field label="Contact or group name"><input maxLength={80} value={phone.name} onChange={event => setScreen('name', event.target.value)} /></Field>
          <Field label="Contact subtitle"><input maxLength={80} value={phone.subtitle} onChange={event => setScreen('subtitle', event.target.value)} /></Field>
          <label className="btn secondary file-btn"><ImagePlus size={16} /> Contact photo<input type="file" accept={acceptImage} onChange={event => void asset(event, 'image', url => setScreen('avatar', url))} /></label>
          <hr />
          <label className="check"><input type="checkbox" checked={phone.showStatus !== false}
            onChange={event => setScreen('showStatus', event.target.checked)} /> Show status bar</label>
          <div className="two-fields">
            <Field label="Status bar time"><input type="time" value={phone.clock} onChange={event => setScreen('clock', event.target.value)} /></Field>
            <Field label="Clock format"><select value={phone.format} onChange={event => setScreen('format', event.target.value as Phone['format'])}><option value="24">24-hour</option><option value="12">AM/PM</option></select></Field>
            <Field label="Battery %"><input type="number" min="0" max="100" value={phone.battery} onChange={event => setScreen('battery', Math.min(100, Math.max(0, Number(event.target.value))))} /></Field>
            <Field label="Signal bars"><select value={phone.signal} onChange={event => setScreen('signal', Number(event.target.value))}>{[0, 1, 2, 3, 4].map(value => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <div className="two-fields"><label className="check"><input type="checkbox" checked={phone.charging} onChange={event => setScreen('charging', event.target.checked)} /> Charging</label>
            <label className="check"><input type="checkbox" checked={phone.wifi} onChange={event => setScreen('wifi', event.target.checked)} /> Wi-Fi</label></div>
          <hr />
          <div className="two-fields">
            <Field label="Wallpaper"><select value={phone.wallpaper ? phone.wallpaperStyle === 'reference' ? 'reference' : 'custom'
              : phone.wallpaperStyle === 'solid' ? 'solid' : 'doodles'} onChange={event => {
              const style = event.target.value;
              if (style === 'doodles' || style === 'solid') {
                setOriginal(false);
                setPhone(current => ({ ...current, wallpaper: undefined, wallpaperStyle: style }));
              }
            }}><option value="doodles">Default doodles</option><option value="solid">Solid color</option>
              {phone.wallpaper && <option value={phone.wallpaperStyle === 'reference' ? 'reference' : 'custom'}>
                {phone.wallpaperStyle === 'reference' ? 'From screenshot' : 'Uploaded image'}</option>}</select></Field>
            <Field label="Wallpaper color"><input type="color" value={phone.background ?? (phone.theme === 'dark' ? '#0c1317' : '#ebe5db')} onChange={event => setScreen('background', event.target.value)} /></Field>
          </div>
          <label className="btn secondary file-btn"><ImagePlus size={16} /> Upload wallpaper<input type="file" accept={acceptImage} onChange={event => void asset(event, 'image', url => setScreen('wallpaper', url))} /></label>
          {phone.wallpaper && <button className="text-btn" onClick={() => setScreen('wallpaper', undefined)}>Remove wallpaper image</button>}
          {reference && <>
            <hr /><h3>Screenshot details</h3>
            {(['status', 'header', 'footer'] as const).filter(key => Boolean(reference[key])).map(key => <label className="check" key={key}><input type="checkbox" checked={preserve[key]}
              onChange={event => { setOriginal(false); setPreserve(current => ({ ...current, [key]: event.target.checked })); }} />
              Use original {key === 'status' ? 'status bar' : key === 'footer' ? 'composer' : 'header'}</label>)}
            <button className="text-btn" onClick={() => {
              setReference(undefined); setOriginal(false); setPreserve(noSlices);
              setPhone(current => ({ ...current, width: defaultPhone.width, height: defaultPhone.height, wallpaper: undefined,
                wallpaperStyle: undefined, textSize: undefined, showStatus: undefined, chrome: undefined,
                background: undefined, incoming: undefined, outgoing: undefined }));
            }}>Remove screenshot reference</button>
          </>}
        </div>}
      </aside>
      <section className={'stage' + (drop ? ' drag-over' : '')} aria-label="Preview workspace"
        onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setDrop(true); } }}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
        onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrop(false); }}
        onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDrop(false); void startScan(event.dataTransfer.files[0]); }}>
        <div className="stage-toolbar"><h2>{original ? 'Original screenshot' : 'Live preview'}</h2>
          {reference ? <div className="segmented"><button aria-pressed={!original} onClick={() => setOriginal(false)}>Preview</button><button aria-pressed={original} onClick={() => setOriginal(true)}>Original</button></div>
            : <button className="preview-device" onClick={() => setTab('phone')}><Smartphone size={15} /> {phone.platform} <ChevronDown size={13} /></button>}
        </div>
        <div className="preview-area" style={{ '--preview-ratio': phone.width / phone.height } as React.CSSProperties}>
          <PhonePreview phone={phone} messages={messages} reference={reference} preserve={preserve}
            original={original} today={today} previewRef={previewRef} messagesRef={messagesRef}
            select={select} editDate={editDate} add={add} />
        </div>
        <div className="stage-footer"><span>{phone.width} × {phone.height}</span><span>{reference ? 'Screenshot reference' : 'Sample phone layout'}</span></div>
        {drop && <div className="drop-target"><Upload size={30} /> Drop screenshot here</div>}
      </section>
      <aside className="right-panel" aria-label="Message details" ref={detailsRef}>
        <div className="details-head"><span className="detail-icon"><Settings2 size={19} /></span><div><h2>Message details</h2><span>{selected ? 'Message ' + (index + 1) + ' of ' + messages.length : 'Select a message to edit'}</span></div></div>
        {selected && <div className="panel-section detail-fields">
          <div className="two-fields">
            <Field label="Side"><select value={selected.outgoing ? 'outgoing' : 'incoming'} onChange={event => {
              const outgoing = event.target.value === 'outgoing'; changeMessage({ outgoing, sender: outgoing ? 'You' : phone.name });
            }}><option value="incoming">Received</option><option value="outgoing">Sent</option></select></Field>
            <Field label="Type"><select value={selected.kind} onChange={event => changeMessage({ kind: event.target.value as Message['kind'], asset: undefined })}>
              <option value="text">Text</option><option value="photo">Photo</option><option value="voice">Voice note</option><option value="event">System message</option></select></Field>
          </div>
          <Field label="Sender"><input value={selected.sender} maxLength={80} onChange={event => changeMessage({ sender: event.target.value })} /></Field>
          <Field label={selected.kind === 'photo' ? 'Caption' : 'Message'}><textarea rows={4} value={selected.text} onChange={event => changeMessage({ text: event.target.value })} /></Field>
          {(selected.kind === 'photo' || selected.kind === 'voice') && <>
            <label className="btn secondary file-btn"><Upload size={16} /> {selected.asset ? 'Replace file' : selected.kind === 'photo' ? 'Upload photo' : 'Upload audio'}
              <input type="file" accept={selected.kind === 'photo' ? acceptImage : 'audio/*'} onChange={event => {
                const messageId = selected.id;
                void asset(event, selected.kind === 'photo' ? 'image' : 'audio', url =>
                  setMessages(current => current.map(message => message.id === messageId ? { ...message, asset: url } : message)));
              }} /></label>
            {selected.kind === 'voice' && !selected.asset && <Field label="Voice note duration"><input value={selected.duration ?? ''} maxLength={8} placeholder="0:08" onChange={event => changeMessage({ duration: event.target.value })} /></Field>}
          </>}
          {selected.kind !== 'event' && <>
            <div className="two-fields">
              <Field label="Message date"><input type="date" value={selected.date || today}
                onChange={event => changeMessage({ date: event.target.value || undefined })} /></Field>
              <Field label="Message time"><input type="time" value={selected.time} onChange={event => changeMessage({ time: event.target.value })} /></Field>
            </div>
            <Field label="Reaction"><input value={selected.reaction ?? ''} maxLength={20} placeholder="e.g. 😂" onChange={event => changeMessage({ reaction: event.target.value })} /></Field>
            <div className="reactions" aria-label="Quick reactions">{['😂', '❤️', '👍', '🔥', '😮', '🙏'].map(emoji =>
              <button key={emoji} className="icon-btn" onClick={() => changeMessage({ reaction: selected.reaction === emoji ? '' : emoji })}
                aria-pressed={selected.reaction === emoji} aria-label={'React ' + emoji}>{emoji}</button>)}</div>
            {selected.outgoing && <Field label="Read receipt"><select value={selected.receipt ?? 'delivered'} onChange={event => changeMessage({ receipt: event.target.value as Message['receipt'] })}>
              <option value="sent">Sent</option><option value="delivered">Delivered</option><option value="read">Read</option></select></Field>}
            <Field label="Quoted reply"><input value={selected.reply ?? ''} maxLength={260} placeholder="Optional" onChange={event => changeMessage({ reply: event.target.value })} /></Field>
          </>}
          <div className="message-actions">
            <button className="icon-btn bordered" disabled={index <= 0} onClick={() => move(-1)} aria-label="Move message up"><ArrowUp size={17} /></button>
            <button className="icon-btn bordered" disabled={index >= messages.length - 1} onClick={() => move(1)} aria-label="Move message down"><ArrowDown size={17} /></button>
            <button className="text-btn danger" onClick={remove}><Trash2 size={16} /> Delete</button>
          </div>
        </div>}
      </aside>
    </main>
    {dateEdit && <Modal title="Change chat date" close={() => setDateEdit(undefined)}>
      <div className="date-presets" role="group" aria-label="Date presets">
        {[-1, 0, 1].map(offset => {
          const currentDay = today || localDate();
          const date = addDays(currentDay, offset);
          return <button key={offset} type="button" className="btn secondary" aria-pressed={dateEdit.value === date}
            onClick={() => setDateEdit({ ...dateEdit, value: date })}>{dateLabel(date, currentDay)}</button>;
        })}
      </div>
      <Field label="Date"><input type="date" value={dateEdit.value}
        onChange={event => setDateEdit({ ...dateEdit, value: event.target.value })} /></Field>
      <div className="dialog-actions"><button type="button" className="btn primary" disabled={!dateEdit.value}
        onClick={applyDate}>Apply date</button></div>
    </Modal>}
    {pending && <Modal title="Apply screenshot" close={() => setPending(undefined)}>
      <div className="reference-review"><img src={pending.reference.source} alt="Screenshot to import" /><div>
        <strong>{pending.phone.width} × {pending.phone.height}</strong>
        <p>{pending.textFailed ? 'Text recognition could not run. You can use the appearance and add messages manually.'
          : pending.messages.length ? pending.messages.length + ' message rows detected. You can correct the text and senders after importing.'
          : 'No message text was detected. You can use the appearance and add your own messages.'}</p>
        <p>Adjust the font and wallpaper in Screen settings.</p>
      </div></div>
      <div className="dialog-actions"><button className="btn secondary" onClick={() => applyScreenshot(false)}>Use appearance</button>
        {pending.messages.length > 0 && <button className="btn primary" onClick={() => applyScreenshot(true)}>Replace with detected chat</button>}</div>
    </Modal>}
    {importOpen && <Modal title="Paste a conversation" close={() => setImportOpen(false)}>
      <Field label="Plain text or HTML"><textarea rows={7} value={script} onChange={event => { setScript(event.target.value); setRows(null); }}
        onPaste={event => {
          const html = event.clipboardData.getData('text/html');
          const plain = event.clipboardData.getData('text/plain');
          if (plain.trimStart().startsWith('<') || !/(data-sender|data-pre-plain-text|<time[\s>])/i.test(html)) return;
          event.preventDefault();
          setScript(html); setRows(null);
        }}
        placeholder={'Riya: Ready for rehearsal?\nYou: Define ready.'} /></Field>
      <div className="two-fields">
        <Field label="Your name in the chat"><input value={ownName} onChange={event => setOwnName(event.target.value)}
          list="import-senders" placeholder="Optional" /></Field>
        <datalist id="import-senders">{[...new Set(rows?.map(row => row.sender).filter(Boolean))].map(sender =>
          <option key={sender} value={sender} />)}</datalist>
        <Field label="Date order"><select value={dateOrder} onChange={event => {
          const order = event.target.value as typeof dateOrder;
          setDateOrder(order);
          if (rows) { setRows(importConversation(script, { today: today || localDate(), order })); setOmitted(new Set()); }
        }}><option value="dmy">Day / month</option><option value="mdy">Month / day</option></select></Field>
      </div>
      {rows && <div className="import-summary" role="status">{rows.length ? <>
        <strong>{reviewed.length} messages ready</strong><ol>{(() => {
          let kept = 0;
          return rows.map((row, position) => {
            const included = !omitted.has(position);
            const preview = included ? reviewed[kept++] : undefined;
            return <li key={position}><label className="check import-row">
              <input type="checkbox" aria-label={'Include message ' + (position + 1)} checked={included} onChange={() => setOmitted(current => {
                const next = new Set(current);
                if (next.has(position)) next.delete(position);
                else next.add(position);
                return next;
              })} />
              <span>{preview && <small>{preview.sender} · {dateLabel(preview.date, today)} · {preview.time} · {preview.outgoing ? 'Sent' : 'Received'}</small>}{row.text}</span>
            </label></li>;
          });
        })()}</ol>
        <label className="check"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} /> Replace current messages</label>
      </> : 'No messages found. Paste a transcript or one message per line.'}</div>}
      <div className="dialog-actions">
        {!rows?.length ? <button className="btn primary" disabled={!script.trim()} onClick={() => {
          setRows(importConversation(script, { today: today || localDate(), order: dateOrder })); setOmitted(new Set());
        }}>Preview import</button>
          : <button className="btn primary" disabled={!reviewed.length} onClick={() => {
            const imported = makeMessages(reviewed);
            const senders = [...new Set(imported.map(message => message.sender.toLowerCase()))];
            if (senders.length > 2 && phone.mode !== 'group') setScreen('mode', 'group');
            if ((replace || !messages.length) && senders.length <= 2) {
              const contact = imported.find(message => !message.outgoing)?.sender;
              if (phone.mode !== 'direct') setScreen('mode', 'direct');
              if (contact && phone.name !== contact) setScreen('name', contact);
            }
            setMessages(current => replace ? imported : [...current, ...imported]);
            scrollNext.current = !replace;
            if (replace && messagesRef.current) messagesRef.current.scrollTop = 0;
            select(imported[0].id, false);
            setNotice(imported.length + ' messages imported.');
            setImportOpen(false); setScript(''); setRows(null);
          }}>{replace ? 'Replace messages' : 'Add imported messages'}</button>}
      </div>
    </Modal>}
  </div>;
}
