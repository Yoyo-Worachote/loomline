import { useState, type CSSProperties } from 'react';
import { getCity } from '../../cities';
import type { CityPack, ScorePart } from '../../engine/types';
import type { GameView, RoomView } from '../../shared/protocol';
import { Board } from '../components/Board';
import { Avatar, LINE_STYLE, LineSwatch } from '../components/icons';
import { objectiveText, partDetail, partLabel, signed } from '../components/ui';
import { useT, type Key, type Translator } from '../i18n';
import { LeaveButton, useSend } from './Lobby';

export function RoundResults({ room, game, you }: { room: RoomView; game: GameView; you: string }) {
  const t = useT();
  const send = useSend();
  const city = getCity(game.cityId)!;
  const line = game.lineOrder[game.round]!;
  const isHost = room.hostId === you;
  const me = room.players.find((p) => p.id === you)!;
  const players = room.players.filter((p) => game.players[p.id]);
  const best = Math.max(...players.map((p) => game.players[p.id]!.lineScores[game.round]!.total));
  const last = game.round === 3;
  return (
    <main className="page results">
      <h1><LineSwatch line={line} width={64} /> {t('roundResults', { n: game.round + 1 })}</h1>
      <div className="result-cards">
        {players.map((p) => {
          const s = game.players[p.id]!;
          const ls = s.lineScores[game.round]!;
          return (
            <section key={p.id} className={`panel result-card${ls.total === best ? ' best' : ''}`}>
              <header>
                <Avatar n={p.avatar} />
                <b>{p.name}</b>
                <strong className="big-score">{ls.total}</strong>
              </header>
              <Board city={city} segments={s.segments} mini label={t('viewing', { name: p.name })} />
              <dl className="score-list">
                {ls.parts.map((x, i) => (
                  <div key={i}>
                    <dt>{partLabel(t, x)} <small>{partDetail(t, x, city)}</small></dt>
                    <dd>{signed(x.points)}</dd>
                  </div>
                ))}
                <div className="sum">
                  <dt>{t('totalSoFar')}</dt>
                  <dd>{s.lineScores.reduce((n, l) => n + l.total, 0)}</dd>
                </div>
              </dl>
              {p.left ? <span className="pill">{t('leftGame')}</span> : p.continued && <span className="pill good">{t('ready')}</span>}
            </section>
          );
        })}
      </div>
      <div className="row center sticky-actions">
        <button type="button" className="primary big" disabled={me.continued} onClick={() => void send({ t: 'continue', round: game.round })}>
          {me.continued ? t('waitingContinue') : last ? t('continueFinal') : t('continue')}
        </button>
        {isHost && me.continued && (
          <button type="button" className="ghost" onClick={() => void send({ t: 'continue', round: game.round, force: true })}>{t('forceContinue')}</button>
        )}
        <LeaveButton />
      </div>
    </main>
  );
}

/** Table rows for the final sheet: each line, then each final part. */
function rowLabel(t: Translator, city: CityPack, p: ScorePart) {
  if (p.rule !== 'objective') return partLabel(t, p);
  const o = city.objectives.find((x) => x.id === p.objectiveId);
  return `${t('r_objective')}: ${o ? objectiveText(t, o) : ''}`;
}

export function FinalResults({ room, game, you }: { room: RoomView; game: GameView; you: string }) {
  const t = useT();
  const send = useSend();
  const city = getCity(game.cityId)!;
  const isHost = room.hostId === you;
  const [show, setShow] = useState(you);
  const who = (id: string) => room.players.find((p) => p.id === id);
  const name = (id: string) => who(id)?.name ?? '?';
  const ranking = (game.ranking ?? []).filter((r) => game.players[r.playerId]?.final);
  const winners = ranking.filter((r) => r.rank === 1);
  const top = Math.max(1, ...ranking.map((r) => r.total));
  const sample = game.players[ranking[0]?.playerId ?? you]!;
  const finalParts = sample.final!.parts.filter((p) => p.rule !== 'lines');
  const shown = game.players[show] ? show : you;

  const title =
    ranking.length === 1
      ? t('soloDone', { n: ranking[0]!.total })
      : winners.length > 1
        ? t('winners', { names: winners.map((w) => name(w.playerId)).join(', ') })
        : t('winner', { name: name(winners[0]!.playerId) });

  return (
    <main className="page results">
      <p className="meta">{t('finalResults')} · {t.l(city.name)}</p>
      <h1>{title}</h1>

      <section className="panel">
        <ol className="podium">
          {ranking.map((r) => {
            const f = game.players[r.playerId]!;
            const plus = [
              ...f.lineScores.map((l) => ({ key: l.line, value: l.total, color: LINE_STYLE[l.line].color, label: t.l(city.lines.find((x) => x.id === l.line)!.name) })),
              ...f.final!.parts.filter((p) => p.rule !== 'lines').map((p, i) => ({ key: `${p.rule}${i}`, value: p.points, color: `hsl(${196 + i * 22} 22% ${38 + i * 9}%)`, label: rowLabel(t, city, p) })),
            ].filter((x) => x.value > 0);
            return (
              <li key={r.playerId}>
                <span className="rank">{r.rank}</span>
                <Avatar n={who(r.playerId)?.avatar ?? 0} />
                <span className="podium-name">
                  <b>{name(r.playerId)}</b>
                  {game.players[r.playerId]!.retired && <small>{t('leftGame')}</small>}
                </span>
                <span className="bar" role="img" aria-label={plus.map((x) => `${x.label} ${x.value}`).join(', ')}>
                  {plus.map((x) => (
                    <span key={x.key} title={`${x.label}: ${x.value}`} style={{ '--w': `${(x.value / top) * 100}%`, background: x.color } as CSSProperties} />
                  ))}
                </span>
                <strong>{r.total}</strong>
              </li>
            );
          })}
        </ol>
        {ranking.length > 1 && <p className="note">{t('tieBreak', { list: city.tieBreakers.map((x) => t(`tie_${x}` as Key)).join(', ') })}</p>}
      </section>

      <section className="panel">
        <h2>{t('breakdown')}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th scope="col" />{ranking.map((r) => <th key={r.playerId} scope="col">{name(r.playerId)}</th>)}</tr>
            </thead>
            <tbody>
              {game.lineOrder.map((line, i) => (
                <tr key={line}>
                  <th scope="row"><LineSwatch line={line} width={34} /> {t.l(city.lines.find((l) => l.id === line)!.name)}</th>
                  {ranking.map((r) => {
                    const ls = game.players[r.playerId]!.lineScores[i]!;
                    return (
                      <td key={r.playerId}>
                        <b>{ls.total}</b>
                        <small>{ls.parts.filter((p) => p.points).map((p) => `${partLabel(t, p)} ${p.points}`).join(' · ')}</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {finalParts.map((fp, i) => (
                <tr key={i}>
                  <th scope="row">{rowLabel(t, city, fp)}</th>
                  {ranking.map((r) => {
                    const p = game.players[r.playerId]!.final!.parts.filter((x) => x.rule !== 'lines')[i]!;
                    return (
                      <td key={r.playerId}>
                        <b>{signed(p.points)}</b>
                        <small>{p.rule === 'objective' ? `${p.detail.n}/${p.detail.goal}` : partDetail(t, p, city)}</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">{t('total')}</th>{ranking.map((r) => <td key={r.playerId}><b>{r.total}</b></td>)}</tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>{t('networks')}</h2>
        <div className="row">
          {ranking.map((r) => (
            <button key={r.playerId} type="button" className={`ghost${shown === r.playerId ? ' on' : ''}`} aria-pressed={shown === r.playerId} onClick={() => setShow(r.playerId)}>
              {name(r.playerId)}
            </button>
          ))}
        </div>
        <Board city={city} segments={game.players[shown]!.segments} label={t('viewing', { name: name(shown) })} />
        {game.seed && <p className="meta">{t('seedNote', { seed: game.seed })}</p>}
      </section>

      <div className="row center sticky-actions">
        {isHost ? (
          <button type="button" className="primary big" onClick={() => void send({ t: 'rematch' })}>{t('rematch')}</button>
        ) : (
          <p className="note">{t('rematchWait')}</p>
        )}
        <LeaveButton />
      </div>
    </main>
  );
}

