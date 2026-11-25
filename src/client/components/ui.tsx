import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, CityPack, Objective, ScorePart } from '../../engine/types';
import type { ErrorCode } from '../../shared/protocol';
import { useT, type Key, type Translator } from '../i18n';
import { CardGlyph, SymbolIcon, cardType } from './icons';

/* ------------------------------------------------------------- toasts */

let push: ((text: string, kind: 'info' | 'bad') => void) | null = null;
export const toast = (text: string, kind: 'info' | 'bad' = 'info') => push?.(text, kind);

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([]);
  const next = useRef(1);
  useEffect(() => {
    push = (text, kind) => {
      const id = next.current++;
      setItems((x) => [...x.filter((i) => i.text !== text).slice(-2), { id, text, kind }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast ${i.kind}`}>{i.text}</div>
      ))}
    </div>
  );
}

export const errorText = (t: Translator, e: ErrorCode) => t(`e_${e}`);

/* ------------------------------------------------------------- dialog */

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export function ConfirmButton({ label, question, onConfirm, className }: { label: string; question: string; onConfirm: () => void; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Dialog title={label} onClose={() => setOpen(false)}>
          <p>{question}</p>
          <div className="row end">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>{t('cancel')}</button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {label}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------- cards */

export function cardTitle(t: Translator, c: Card) {
  const type = cardType(c);
  return type === 'symbol' ? t(`sym_${c.symbol}`) : t(`card_${type}`);
}

export function cardText(t: Translator, c: Card) {
  const type = cardType(c);
  const base = t(`cardDo_${type}`, { sym: t(`sym_${c.symbol}`) });
  return c.tunnelPass && type !== 'tunnel' ? `${base} (${t('cardDo_tunnelToo')})` : base;
}

export function CardFace({ card, big }: { card: Card; big?: boolean }) {
  const t = useT();
  const type = cardType(card);
  return (
    <div className={`card ${big ? 'big' : 'small'} type-${type}`} title={big ? undefined : cardTitle(t, card)}>
      <CardGlyph card={card} />
      {big && (
        <div className="card-copy">
          <span className="card-kind">{t(`card_${type}`)}</span>
          <strong>{cardTitle(t, card)}</strong>
          <span>{cardText(t, card)}</span>
        </div>
      )}
      {card.lantern && <Lantern lit label={t('lanternCard')} />}
      {!big && <span className="sr">{cardTitle(t, card)}{card.lantern ? `, ${t('lanternCard')}` : ''}</span>}
    </div>
  );
}

export function Lantern({ lit, label }: { lit: boolean; label?: string }) {
  return (
    <svg className={`lantern${lit ? ' lit' : ''}`} width="18" height="22" viewBox="0 0 18 22" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M9 1 V4 M4 5 H14 M4 18 H14 M9 18 V21" />
      <ellipse cx="9" cy="11.5" rx="7" ry="6.5" />
    </svg>
  );
}

/* ------------------------------------------------------------- scores */

export function partLabel(t: Translator, p: ScorePart): string {
  return t(`r_${p.rule}` as Key);
}

/** Short explanation of where points came from. */
export function partDetail(t: Translator, p: ScorePart, city: CityPack): string {
  const d = p.detail;
  switch (p.rule) {
    case 'districtTimesConcentration':
      return `${d.districts} × ${d.concentration}`;
    case 'bankBalance':
      return `min(${d.a}, ${d.b}) × ${d.per}`;
    case 'interchanges':
      return t('d_interchanges', d);
    case 'loop':
      return d.missing ? t('d_loopMissing', d) : t('d_loopComplete');
    case 'oneNetwork':
      return t('d_components', d);
    case 'objective': {
      const o = city.objectives.find((x) => x.id === p.objectiveId);
      return o ? `${objectiveText(t, o)} (${d.n})` : '';
    }
    case 'lines':
      return '';
    default:
      return d.per === undefined ? `${d.n}` : `${d.n} × ${d.per}`;
  }
}

export const objectiveText = (t: Translator, o: Objective) => t(`o_${o.rule.type}`, { n: o.rule.count });

export const signed = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

export function ScoreList({ parts, city }: { parts: ScorePart[]; city: CityPack }) {
  const t = useT();
  return (
    <dl className="score-list">
      {parts.map((p, i) => (
        <div key={i}>
          <dt>
            {partLabel(t, p)} <small>{partDetail(t, p, city)}</small>
          </dt>
          <dd>{signed(p.points)}</dd>
        </div>
      ))}
      <div className="sum">
        <dt>{t('total')}</dt>
        <dd>{signed(parts.reduce((s, p) => s + p.points, 0))}</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------- legend */

export function Legend({ city }: { city: CityPack }) {
  const t = useT();
  const has = (k: 'landmark' | 'stamp' | 'loop' | 'hub') => city.stations.some((s) => s[k]);
  return (
    <details className="legend">
      <summary>{t('legend')}</summary>
      <ul>
        {(['drop', 'leaf', 'spark', 'hex', 'any'] as const).map((s) => (
          <li key={s}><SymbolIcon symbol={s} size={20} /> {t(`sym_${s}`)}</li>
        ))}
        <li><span className="lg lg-start" /> {t('lg_start')}</li>
        {has('landmark') && <li><span className="lg lg-landmark" /> {t('lg_landmark')}</li>}
        {has('stamp') && <li><span className="lg lg-stamp" /> {t('lg_stamp')}</li>}
        {has('loop') && <li><span className="lg lg-loop" /> {t('lg_loop')}</li>}
        {has('hub') && <li><span className="lg lg-hub" /> {t('lg_hub')}</li>}
        {city.river && <li><span className="lg lg-river" /> {t('lg_river')}</li>}
        {city.edges.some((e) => e.bridge) && <li><span className="lg lg-bridge" /> {t('lg_bridge')}</li>}
        {city.edges.some((e) => e.tunnel) && <li><span className="lg lg-tunnel" /> {t('lg_tunnel')}</li>}
      </ul>
    </details>
  );
}
