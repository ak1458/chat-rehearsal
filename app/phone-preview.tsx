import { ArrowLeft, Check, CheckCheck, ChevronDown, ChevronsDown, ChevronLeft, EllipsisVertical, ImagePlus, Mic, Phone as Call, Play, Plus, Smile, Video, Wifi, Zap } from 'lucide-react';
import { Fragment, useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { displayTime, type Message, type Phone } from '../lib/chat';
import type { Reference } from '../lib/screenshot';
import { dateLabel } from '../lib/timeline';
import { doodles } from '../lib/doodles';

export type Preserve = { status: boolean; header: boolean; footer: boolean };
type Props = {
  phone: Phone;
  messages: Message[];
  reference?: Reference;
  preserve: Preserve;
  original: boolean;
  today: string;
  previewRef: RefObject<HTMLDivElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  select: (id: string) => void;
  add: () => void;
};

const waveform = [11, 20, 14, 28, 38, 31, 15, 27, 41, 33, 23, 35, 20, 31, 15, 21, 13, 31, 22, 11, 17, 9, 14, 7];
const fonts = {
  system: 'system-ui, sans-serif', roboto: '"Roboto Variable", Roboto, sans-serif',
  inter: '"Inter Variable", sans-serif', noto: '"Noto Sans Variable", sans-serif',
  arial: 'Arial, sans-serif',
};

export function PhonePreview({ phone, messages, reference, preserve, original, today, previewRef, messagesRef, select, add }: Props) {
  const [canJump, setCanJump] = useState(false);
  useEffect(() => {
    const body = messagesRef.current;
    if (!body) return;
    function update() {
      if (body) setCanJump(body.scrollHeight - body.clientHeight - body.scrollTop > 24);
    }
    body.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    update();
    return () => {
      observer.disconnect();
      body.removeEventListener('scroll', update);
    };
  }, [messagesRef, original]);

  const android = phone.platform === 'Android';
  const ratio = phone.width / phone.height;
  const sourceStatus = reference && preserve.status ? reference.status : undefined;
  const sourceHeader = reference && preserve.header ? reference.header : undefined;
  const sourceFooter = reference && preserve.footer ? reference.footer : undefined;
  const wallpaper = phone.wallpaper ? 'url("' + phone.wallpaper + '")'
    : phone.wallpaperStyle === 'solid' ? undefined : doodles[phone.theme];
  const style = {
    '--screen-ratio': phone.width + '/' + phone.height,
    '--status-height': (sourceStatus ? reference!.statusFraction * 100 : Math.max(reference?.statusFraction ?? 0, ratio * .089) * 100) + '%',
    '--header-height': (sourceHeader ? reference!.headerFraction * 100 : Math.max(reference?.headerFraction ?? 0, ratio * .134) * 100) + '%',
    '--footer-height': (sourceFooter ? reference!.footerFraction * 100 : Math.max(reference?.footerFraction ?? 0, ratio * .151) * 100) + '%',
    '--sample-bg': phone.background,
    '--sample-chrome': phone.chrome,
    '--sample-out': phone.outgoing,
    '--sample-in': phone.incoming,
    '--wallpaper': wallpaper,
    '--wallpaper-repeat': phone.wallpaper ? 'no-repeat' : 'repeat',
    '--wallpaper-size': phone.wallpaperStyle === 'reference' ? '100% 100%' : phone.wallpaper ? 'cover' : '58cqw auto',
    '--phone-font': phone.font && phone.font !== 'auto' ? fonts[phone.font] :
      android ? fonts.roboto : '-apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif',
    '--bubble-text-size': phone.textSize ? phone.textSize + 'cqw' : undefined,
  } as CSSProperties;
  const photo = phone.avatar ? <img src={phone.avatar} alt="" /> : phone.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <div className={'phone ' + phone.theme + (android ? ' android' : '') + (reference ? ' reference' : '')}
    ref={previewRef} style={style} aria-label={original ? 'Original screenshot' : 'Chat preview'}>
    {original && reference ? <img className="original" src={reference.source} alt="Original WhatsApp screenshot" /> : <>
      <div className="phone-status">
        {sourceStatus ? <img className="source-slice" src={sourceStatus} alt="Original status bar" /> : <>
          <strong>{displayTime(phone.clock, phone.format)}</strong>
          <div className="status-right">
            <span className="bars" aria-label={phone.signal + ' signal bars'}>{[1, 2, 3, 4].map(bar => <i key={bar} style={{ opacity: bar <= phone.signal ? 1 : .25 }} />)}</span>
            {phone.wifi && <Wifi size="4.25cqw" strokeWidth={2.7} />}
            <span className="battery" aria-label={phone.battery + '% battery' + (phone.charging ? ', charging' : '')}>
              <span style={{ width: phone.battery + '%' }} />
              <b>{phone.battery}</b>
            </span>
            {phone.charging && <Zap size="2.7cqw" fill="currentColor" />}
          </div>
        </>}
      </div>
      <div className="phone-header">
        {sourceHeader ? <img className="source-slice" src={sourceHeader} alt="Original chat header" /> : <>
          {android ? <ArrowLeft size="5.6cqw" /> : <ChevronLeft size="7cqw" />}
          <span className="avatar">{photo}</span>
          <span className="phone-contact"><strong>{phone.name || 'Chat'}</strong><small>{phone.subtitle}</small></span>
          <Video size="5.9cqw" />
          <Call size="5cqw" />
          {android && <EllipsisVertical size="5cqw" />}
        </>}
      </div>
      <div className="phone-thread">
      <div className="phone-messages" ref={messagesRef} tabIndex={0}>
        <div className="message-flow">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const date = message.date || today;
            const newDay = !previous || date !== (previous.date || today);
            const tail = newDay || previous.outgoing !== message.outgoing || previous.sender !== message.sender || previous.kind === 'event';
            const side = message.outgoing ? 'outgoing' : 'incoming';
            return <Fragment key={message.id}>
              {newDay && <span className="date-chip" data-export-decoration>{dateLabel(date, today)}</span>}
              {message.kind === 'event' ? <button type="button" className="date-chip event"
                onClick={() => select(message.id)}>{message.text}</button> :
              <div className={'bubble-row ' + side + (message.reaction ? ' has-reaction' : '')}
              data-sender={message.sender} data-side={side} data-time={message.time} data-date={date || undefined}>
              <div className={'bubble' + (tail ? ' tail' : '')}>
                <button type="button" className="bubble-hit" aria-label={'Edit message from ' + message.sender}
                  title="Edit message" onClick={() => select(message.id)} />
                {phone.mode === 'group' && !message.outgoing && tail && <span className="bubble-sender" data-export-decoration>{message.sender}</span>}
                {message.reply && <span className="reply-quote" data-export-decoration>{message.reply}</span>}
                {message.kind === 'photo' && (message.asset
                  ? <img className="message-photo" src={message.asset} alt="" />
                  : <span className="photo-placeholder"><ImagePlus size="7cqw" /> Photo</span>)}
                {message.kind === 'voice' && <div className="voice" data-export-decoration>
                  {message.asset ? <audio src={message.asset} controls preload="metadata" />
                    : <><Play size="4.7cqw" fill="currentColor" /><span className="wave" aria-hidden>{waveform.map((size, i) => <i key={i} style={{ height: size / 8 + 'cqw' }} />)}</span>
                      <span className="voice-duration">{message.duration || '0:08'}</span></>}
                </div>}
                {message.text && <span className="bubble-text">{message.text}</span>}
                <span className="bubble-time" data-export-decoration>{displayTime(message.time, phone.format)}
                  {message.outgoing && (message.receipt === 'sent' ? <Check size="3.65cqw" /> :
                    <CheckCheck size="3.9cqw" className={message.receipt === 'read' ? 'read-tick' : ''} />)}</span>
                {message.reaction && <span className="reaction" data-export-decoration>{message.reaction}</span>}
              </div>
            </div>}
            </Fragment>;
          })}
          {messages.length === 0 && <button className="date-chip empty-chat" data-export-decoration type="button" onClick={add}>+ Add a message</button>}
        </div>
      </div>
      {canJump && <button type="button" className="jump-to-latest" data-export-decoration title="Jump to latest message"
        aria-label="Jump to latest message" onClick={() => {
          const body = messagesRef.current;
          if (body) body.scrollTo({ top: body.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }}>{android ? <ChevronsDown size="5.7cqw" /> : <ChevronDown size="5.4cqw" />}</button>}
      </div>
      <div className="phone-footer">
        {sourceFooter ? <img className="source-slice" src={sourceFooter} alt="Original message composer" /> :
          <><div className="phone-compose">
            {!android && <Plus size="6cqw" />}
            <button type="button" onClick={add} className="compose-field"><Smile size="5.2cqw" /><span>Message</span></button>
            <span className="phone-mic"><Mic size="5cqw" /></span>
          </div><span className="home-indicator" /></>}
      </div>
    </>}
  </div>;
}
