import { Wifi, Zap } from 'lucide-react';
import { displayTime, type Phone } from '../lib/chat';

export function PhoneStatus({ phone, source }: { phone: Phone; source?: string }) {
  const layout = phone.statusLayout && phone.statusLayout !== 'device' ? phone.statusLayout
    : phone.platform === 'Android' ? 'android-pill' : 'iphone';
  const showPercent = phone.showBatteryPercent ?? true;
  const vertical = layout === 'android-classic';
  const percentInside = showPercent && !vertical;

  return <div className={'phone-status status-' + layout} data-export-decoration>
    {phone.showStatus !== false && (source ? <img className="source-slice" src={source} alt="Original status bar" /> : <>
      <strong>{displayTime(phone.clock, phone.clockFormat ?? phone.format)}</strong>
      <div className="status-right">
        {phone.network && <span className="status-network">{phone.network}</span>}
        {phone.wifi && <Wifi size="3.8cqw" strokeWidth={2.8} aria-label="Wi-Fi" />}
        {layout === 'iphone' ? <span className="bars" aria-label={phone.signal + ' signal bars'}>
          {[1, 2, 3, 4].map(bar => <i key={bar} style={{ opacity: bar <= phone.signal ? 1 : .25 }} />)}
        </span> : <svg className="status-signal" viewBox="0 0 16 16" role="img" aria-label={phone.signal + ' signal bars'}>
          <path d="M1 15 15 1v14Z" fill="currentColor" opacity=".25" />
          <path d={'M' + (15 - phone.signal * 3.5) + ' 15 15 ' + (15 - phone.signal * 3.5) + 'v' + phone.signal * 3.5 + 'Z'} fill="currentColor" />
        </svg>}
        <span className="status-power" aria-label={phone.battery + '% battery' + (phone.charging ? ', charging' : '')} role="img">
          {showPercent && vertical && <span>{phone.battery}%</span>}
          <span className={'battery' + (percentInside ? ' battery-with-number' : '')}>
            <i style={vertical ? { height: phone.battery + '%' } : { width: (percentInside ? 100 - phone.battery : phone.battery) + '%' }} />
            {percentInside && <b>{phone.battery}</b>}
          </span>
          {phone.charging && <Zap size="2.7cqw" fill="currentColor" aria-hidden />}
        </span>
      </div>
    </>)}
  </div>;
}
