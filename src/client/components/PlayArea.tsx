import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { indexCity } from '../../engine/network';
import { explainTarget, legalMoves, type MoveContext } from '../../engine/moves';
import type { Card, CityPack, LegalMove, LineId, Segment } from '../../engine/types';
import { useT } from '../i18n';
import { play } from '../sound';
import { Board } from './Board';
import { CardFace, errorText, toast } from './ui';

export interface PlayAreaProps {
  city: CityPack;
  segments: Segment[];
  line: LineId;
  card: Card;
  /** True while this player may act. */
  deciding: boolean;
  /** Changes whenever the decision point changes; clears the local selection. */
  turn: string;
  /** Prompt shown while not deciding. */
  waiting: string;
  prompt: string;
  onBuild: (m: LegalMove) => Promise<boolean>;
  onPass?: () => Promise<boolean>;
  /** Hook for the tutorial. */
  onRefused?: (station: string) => void;
  boardOverlay?: ReactNode;
  children?: ReactNode;
}

/** The board plus the move controls. Holds only the uncommitted selection; nothing here decides legality for the server. */
export function PlayArea(p: PlayAreaProps) {
  const { city, segments, line, card, deciding, turn } = p;
  const t = useT();
  const ctx = useMemo<MoveContext>(() => ({ ix: indexCity(city), segments, line, card }), [city, segments, line, card]);
  const moves = useMemo(() => (deciding ? legalMoves(ctx) : []), [ctx, deciding]);
  const [origin, setOrigin] = useState<string | null>(null);
  const [pick, setPick] = useState<LegalMove | null>(null);
  const [passArmed, setPassArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const reset = () => {
    setOrigin(null);
    setPick(null);
    setPassArmed(false);
    setWhy(null);
  };
  useEffect(reset, [turn, deciding]);

  const name = (id: string) => t.l(ctx.ix.station.get(id)!.name);
  const targets = useMemo(
    () => new Set(moves.filter((m) => !origin || m.from === origin).map((m) => m.to)),
    [moves, origin],
  );
  const origins = useMemo(() => new Set(moves.map((m) => m.from)), [moves]);
  const alternatives = pick ? moves.filter((m) => m.to === pick.to) : [];

  const refuse = (text: string, station: string) => {
    play('deny');
    setWhy(text);
    toast(text, 'bad');
    p.onRefused?.(station);
  };

  const onStation = (id: string) => {
    setPassArmed(false);
    setWhy(null);
    if (!deciding) return toast(p.waiting);
    let options = moves.filter((m) => m.to === id && (!origin || m.from === origin));
    if (!options.length && origin) options = moves.filter((m) => m.to === id);
    if (options.length) {
      const i = pick ? options.findIndex((m) => m.edge === pick.edge) : -1;
      const next = options[(i + 1) % options.length]!;
      setPick(next);
      if (origin && next.from !== origin) setOrigin(null);
      return;
    }
    if (origins.has(id)) {
      setPick(null);
      setOrigin(origin === id ? null : id);
      return;
    }
    const reason = explainTarget(ctx, id);
    refuse(errorText(t, reason ?? 'noEdge'), id);
  };

  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await fn()) reset();
    } finally {
      setBusy(false);
    }
  };

  const hint = !deciding
    ? p.waiting
    : pick
      ? t('previewHint', { from: name(pick.from), to: name(pick.to) })
      : origin
        ? t('originHint', { name: name(origin) })
        : moves.length
          ? t('pickHint')
          : t('noMoves');

  return (
    <>
      <div className="board-wrap">
        <Board
          city={city} segments={segments} activeLine={line} targets={targets} origins={origins} origin={origin} preview={pick}
          onStation={onStation} label={t.l(city.name)}
        />
        {p.boardOverlay}
      </div>
      <section className={`actions${deciding ? ' mine' : ''}`} aria-label={p.prompt}>
        {/* Narrow screens scroll the full card out of view, so repeat it here. */}
        <div className="action-card"><CardFace card={card} /></div>
        <div className="action-text" aria-live="polite">
          <strong>{deciding ? p.prompt : p.waiting}</strong>
          {deciding && <span>{hint}</span>}
          {pick && alternatives.length > 1 && <small>{t('cycleHint')}</small>}
          {why && <small className="bad">{why}</small>}
        </div>
        {deciding && (
          <div className="action-buttons">
            {moves.length > 0 && (
              <select
                aria-label={t('moveList', { n: moves.length })}
                value={pick ? `${pick.from}|${pick.edge}` : ''}
                onChange={(e) => {
                  const m = moves.find((x) => `${x.from}|${x.edge}` === e.target.value) ?? null;
                  setWhy(null);
                  setPassArmed(false);
                  setOrigin(null);
                  setPick(m);
                }}
              >
                <option value="">{t('moveList', { n: moves.length })}</option>
                {moves.map((m) => (
                  <option key={`${m.from}|${m.edge}`} value={`${m.from}|${m.edge}`}>
                    {name(m.from)} → {name(m.to)}
                  </option>
                ))}
              </select>
            )}
            {(pick || origin) && <button type="button" className="ghost" onClick={reset}>{t('cancel')}</button>}
            {p.onPass && !pick && (
              <button
                type="button"
                className={passArmed ? 'danger' : 'ghost'}
                disabled={busy}
                onClick={() => (passArmed || !moves.length ? void run(p.onPass!) : setPassArmed(true))}
              >
                {passArmed ? t('passSure') : t('pass')}
              </button>
            )}
            {moves.length > 0 && (
              <button type="button" className="primary" disabled={!pick || busy} onClick={() => pick && void run(() => p.onBuild(pick))}>
                {t('confirm')}
              </button>
            )}
          </div>
        )}
        {p.children}
      </section>
    </>
  );
}
