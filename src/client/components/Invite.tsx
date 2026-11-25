import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { useT } from '../i18n';
import { inviteLink } from '../router';
import { toast } from './ui';

async function copy(text: string, ok: string, bad: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast(bad, 'bad');
  }
}

function Qr({ text, label }: { text: string; label: string }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const size = q.getModuleCount();
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (q.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
    return { n: size, d: path };
  }, [text]);
  return (
    // Four modules of quiet zone, black on white, so phone cameras read it reliably.
    <svg className="qr" viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

const LOOPBACK = /^(localhost|127\.|\[::1\])/;

/** Everything needed to bring a friend in: code, link, system share sheet and QR. */
export function Invite({ code }: { code: string }) {
  const t = useT();
  const link = inviteLink(code);
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try {
      await navigator.share({ title: t('appName'), text: t('shareText', { code }), url: link });
    } catch (e) {
      // Closing the share sheet is not an error.
      if ((e as Error).name !== 'AbortError') void copy(link, t('copied'), t('copyFailed'));
    }
  };
  return (
    <div className="invite">
      <div className="invite-main">
        <span className="meta">{t('roomCode')}</span>
        <output className="code">{code}</output>
        <div className="row">
          {canShare && <button type="button" className="primary" onClick={() => void share()}>{t('shareLink')}</button>}
          <button type="button" className={canShare ? 'ghost' : 'primary'} onClick={() => void copy(link, t('copied'), t('copyFailed'))}>{t('copyLink')}</button>
          <button type="button" className="ghost" onClick={() => void copy(code, t('copied'), t('copyFailed'))}>{t('copyCode')}</button>
        </div>
        <input className="link" readOnly value={link} aria-label={t('inviteLink')} onFocus={(e) => e.target.select()} />
        {LOOPBACK.test(location.hostname) && <p className="note warn">{t('localOnly')}</p>}
      </div>
      <figure>
        <Qr text={link} label={t('qrLabel', { code })} />
        <figcaption>{t('qrHint')}</figcaption>
      </figure>
    </div>
  );
}
