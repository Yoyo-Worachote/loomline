import { useEffect, useRef, useState } from 'react';
import { getCity } from '../../cities';
import { turnKey } from '../../engine/game';
import { objectiveProgress, scoreLine } from '../../engine/scoring';
import type { GameView, PlayerView, RoomView } from '../../shared/protocol';
import { Board } from '../components/Board';
import { Avatar, LINE_STYLE, LineSwatch } from '../components/icons';
import { PlayArea } from '../components/PlayArea';
import { CardFace, ConfirmButton, Lantern, Legend, ScoreList, cardTitle, objectiveText, toast } from '../components/ui';
import { useT, type Key } from '../i18n';
import { useNet } from '../net';
import { play } from '../sound';
import { LeaveButton, useSend } from './Lobby';

function Countdown({ deadline }: { deadline: number }) {
  const t = useT();
  const { clockSkew } = useNet();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now - clockSkew) / 1000));
  return <span className={`pill${left <= 10 ? ' bad' : ''}`} role="timer">{t('timeLeft', { n: left })}</span>;
}

/** Reveals and rounds can pass quickly when nobody has a move, so announce what was skipped. */
function useAnnouncements(game: GameView) {
  const t = useT();
  const seen = useRef({ round: game.round, n: game.revealed.length, phase: game.phase });
  useEffect(() => {
    const was = seen.current;
    seen.current = { round: game.round, n: game.revealed.length, phase: game.phase };
    if (game.phase !== was.phase && game.phase !== 'playing') {
      play('round');
      return;
    }
    if (game.round !== was.round || game.revealed.length > was.n) {
      play('card');
      const from = game.round === was.round ? was.n : 0;
      const skipped = game.revealed.slice(from, -1);
      if (skipped.length) toast(`${t('status_autoPassed')}: ${skipped.map((c) => cardTitle(t, c)).join(', ')}`);
    }
  }, [game.round, game.revealed, game.phase, t]);
}

export function Game({ room, game, you }: { room: RoomView; game: GameView; you: string }) {
  const t = useT();
  const send = useSend();
  const net = useNet();
  const city = getCity(game.cityId)!;
  const me = game.players[you]!;
  const isHost = room.hostId === you;
  const [watch, setWatch] = useState<string | null>(null);
  useAnnouncements(game);

  const line = game.lineOrder[game.round]!;
  const card = game.revealed[game.revealed.length - 1]!;
  const reveal = game.revealed.length - 1;
  const turn = turnKey({ round: game.round, reveal, players: game.players }, you);
  const deciding = me.status === 'deciding' && !room.paused && net.status === 'online';
  const waitingFor = room.players.filter((p) => game.players[p.id]?.status === 'deciding').length;
  const allowed = card.segments ?? 1;
  const prompt = me.left < allowed ? t('secondSegment') : t('yourTurn');
  const waiting = room.paused
    ? t('pausedTitle')
    : net.status !== 'online'
      ? t('reconnecting')
      : me.status === 'autoPassed'
        ? `${t('noMoves')} · ${t('waitOthers', { n: waitingFor })}`
        : t('waitOthers', { n: waitingFor });

  const end = city.roundEnd;
  const lanterns = game.revealed.filter((c) => c.lantern).length;
  const last = end.type === 'reveals' ? reveal + 1 >= end.count : lanterns >= end.count;
  const mine = scoreLine(city, me.segments, line);
  const watching = watch && watch !== you ? room.players.find((p) => p.id === watch) : undefined;
  const lineDef = city.lines.find((l) => l.id === line)!;

  const seat = (p: PlayerView) => {
    const s = game.players[p.id];
    if (!s) return null;
    const done = s.lineScores.reduce((sum, l) => sum + l.total, 0);
    return (
      <li key={p.id} className={`seat${p.connected || p.left ? '' : ' off'}${p.left ? ' gone' : ''}`}>
        <button
          type="button" className={`seat-btn${(watch ?? you) === p.id ? ' on' : ''}`} aria-pressed={(watch ?? you) === p.id}
          onClick={() => setWatch(p.id === you ? null : p.id)}
        >
          <Avatar n={p.avatar} size={30} />
          <span className="seat-name">
            <b>{p.name}{p.id === you ? ` (${t('you')})` : ''}</b>
            <small>
              {p.left ? t('status_left') : !p.connected ? t('offline') : t(`status_${s.status}` as Key)} · {t('segments', { n: s.segments.length })}
            </small>
          </span>
          <span className="seat-score" title={t('totalSoFar')}>{done}</span>
        </button>
        {isHost && !p.connected && !p.left && s.status === 'deciding' && (
          <button
            type="button" className="ghost small"
            onClick={() => void send({ t: 'skip', playerId: p.id, turn: turnKey({ round: game.round, reveal, players: game.players }, p.id) })}
          >
            {t('skipPlayer')}
          </button>
        )}
      </li>
    );
  };

  return (
    <main className="game">
      <header className="game-head">
        <span className="round-chip" style={{ borderColor: LINE_STYLE[line].color }}>
          <LineSwatch line={line} /> <b>{t('round', { n: game.round + 1 })}</b> {t.l(lineDef.name)}
        </span>
        <span className="pill">
          {end.type === 'reveals' ? t('cardOf', { n: reveal + 1, total: end.count }) : t('cardN', { n: reveal + 1 })}
        </span>
        {end.type === 'lanterns' && (
          <span className="pill lanterns" aria-label={t('lanterns', { n: lanterns, total: end.count })}>
            {Array.from({ length: end.count }, (_, i) => <Lantern key={i} lit={i < lanterns} />)}
          </span>
        )}
        {last && <span className="pill warn">{t('lastCard')}</span>}
        {room.deadline !== null && <Countdown deadline={room.deadline} />}
        <span className="spacer" />
        <details className="menu">
          <summary>{t('menu')}</summary>
          <div className="menu-body">
            <span className="meta">{t('roomCode')}: {room.code}</span>
            {isHost && <button type="button" className="ghost" onClick={() => void send({ t: 'pause', paused: !room.paused })}>{room.paused ? t('resume') : t('pause')}</button>}
            {isHost && <ConfirmButton className="ghost" label={t('restart')} question={t('restartConfirm')} onConfirm={() => void send({ t: 'restart', confirm: true })} />}
            <LeaveButton />
          </div>
        </details>
      </header>

      <div className="game-main">
        {watching ? (
          <div className="board-wrap">
            <Board city={city} segments={game.players[watching.id]!.segments} activeLine={line} label={t('viewing', { name: watching.name })} />
            <div className="watch-bar">
              {t('viewing', { name: watching.name })}
              <button type="button" className="primary" onClick={() => setWatch(null)}>{t('backToMine')}</button>
            </div>
          </div>
        ) : (
          <PlayArea
            city={city} segments={me.segments} line={line} card={card} deciding={deciding} turn={turn} prompt={prompt} waiting={waiting}
            onBuild={async (m) => {
              const ok = await send({ t: 'build', turn, from: m.from, edge: m.edge });
              if (ok) play('build');
              return ok;
            }}
            onPass={async () => {
              const ok = await send({ t: 'pass', turn });
              if (ok) play('pass');
              return ok;
            }}
            boardOverlay={
              room.paused && (
                <div className="overlay">
                  <h2>{t('pausedTitle')}</h2>
                  <p>{isHost ? t('pausedHost') : t('pausedGuest')}</p>
                  {isHost && <button type="button" className="primary" onClick={() => void send({ t: 'pause', paused: false })}>{t('resume')}</button>}
                </div>
              )
            }
          />
        )}
      </div>

      <aside className="game-side">
        <section className="panel card-panel" aria-live="polite">
          <h2>{t('activeCard')}</h2>
          <div key={`${game.round}.${reveal}`} className="flip"><CardFace card={card} big /></div>
          {game.revealed.length > 1 && (
            <>
              <h3>{t('history')}</h3>
              <div className="card-row">{game.revealed.slice(0, -1).map((c) => <CardFace key={c.id} card={c} />)}</div>
            </>
          )}
        </section>
        <section className="panel">
          <h2>{t('players')}</h2>
          <ul className="seats">{room.players.map(seat)}</ul>
        </section>
        <section className="panel">
          <h2>{t('scoreNow')}</h2>
          <ScoreList parts={mine.parts} city={city} />
        </section>
        {game.objectives.length > 0 && (
          <section className="panel">
            <h2>{t('objectives')}</h2>
            <ul className="plain objectives">
              {game.objectives.map((id) => {
                const o = city.objectives.find((x) => x.id === id)!;
                const n = objectiveProgress(city, me.segments, o.rule);
                return (
                  <li key={id} className={n >= o.rule.count ? 'done' : ''}>
                    {objectiveText(t, o)} <b>{Math.min(n, o.rule.count)}/{o.rule.count}</b> <small>+{o.points}</small>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section className="panel"><Legend city={city} /></section>
      </aside>
    </main>
  );
}
