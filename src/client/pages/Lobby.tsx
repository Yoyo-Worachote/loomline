import { CITIES, getCity } from '../../cities';
import { TURN_LIMITS } from '../../shared/constants';
import type { RoomSettings, RoomView } from '../../shared/protocol';
import { Board } from '../components/Board';
import { Avatar, CityArt } from '../components/icons';
import { Invite } from '../components/Invite';
import { ConfirmButton, errorText, toast } from '../components/ui';
import { useT } from '../i18n';
import { request } from '../net';
import { go } from '../router';

export function useSend() {
  const t = useT();
  return async (body: Parameters<typeof request>[0]) => {
    const r = await request(body);
    if (!r.ok) toast(errorText(t, r.error), 'bad');
    return r.ok;
  };
}

export function LeaveButton() {
  const t = useT();
  const send = useSend();
  return (
    <ConfirmButton
      className="ghost" label={t('leave')} question={t('leaveConfirm')}
      onConfirm={() => void send({ t: 'leave' }).then((ok) => ok && go(''))}
    />
  );
}

export function Lobby({ room, you }: { room: RoomView; you: string }) {
  const t = useT();
  const send = useSend();
  const isHost = room.hostId === you;
  const city = getCity(room.cityId)!;
  const me = room.players.find((p) => p.id === you)!;
  const guests = room.players.filter((p) => p.id !== room.hostId);
  const ready = guests.filter((p) => p.ready).length;
  const allReady = ready === guests.length;
  const config = (cityId: string, patch: Partial<RoomSettings> = {}) =>
    void send({ t: 'config', cityId, settings: { ...room.settings, ...patch } });
  const toggle = (m: 'objectives' | 'specials') =>
    config(room.cityId, {
      modules: room.settings.modules.includes(m) ? room.settings.modules.filter((x) => x !== m) : [...room.settings.modules, m],
    });

  return (
    <main className="page lobby">
      <section className="panel room-head">
        <Invite code={room.code} />
        <LeaveButton />
      </section>

      <div className="lobby-cols">
        <section className="panel">
          <h2>{t('players')}</h2>
          <ul className="seats">
            {Array.from({ length: city.maxPlayers }, (_, seat) => {
              const p = room.players.find((x) => x.seat === seat);
              if (!p) return <li key={seat} className="seat empty">{t('emptySeat')}</li>;
              return (
                <li key={seat} className={`seat${p.connected ? '' : ' off'}`}>
                  <Avatar n={p.avatar} />
                  <span className="seat-name">
                    <b>{p.name}</b>
                    <small>
                      {[p.id === you && t('you'), p.id === room.hostId && t('host'), !p.connected && t('offline')].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  {p.id !== room.hostId && <span className={`pill ${p.ready ? 'good' : ''}`}>{p.ready ? t('ready') : t('notReady')}</span>}
                  {isHost && p.id !== you && (
                    <button type="button" className="ghost small" onClick={() => void send({ t: 'kick', playerId: p.id })}>{t('kick')}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {isHost ? (
            <>
              <button type="button" className="primary big" disabled={!allReady} onClick={() => void send({ t: 'start' })}>
                {guests.length ? t('startGame') : t('startAlone')}
              </button>
              {!allReady && <p className="note">{t('waitingReady', { n: ready, total: guests.length })}</p>}
            </>
          ) : (
            <>
              <button type="button" className={`big ${me.ready ? 'ghost' : 'primary'}`} onClick={() => void send({ t: 'ready', ready: !me.ready })}>
                {me.ready ? t('unReady') : t('setReady')}
              </button>
              {me.ready && <p className="note">{t('waitingHost')}</p>}
            </>
          )}
          {room.history.length > 0 && (
            <>
              <h3>{t('gameHistory')}</h3>
              <ul className="plain">
                {room.history.map((h) => (
                  <li key={h.finishedAt}>
                    {t.l(getCity(h.cityId)?.name ?? { th: h.cityId, en: h.cityId })}: {h.results.map((r) => `${r.rank}. ${r.name} ${r.total}`).join(' · ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('chooseCity')}</h2>
          {!isHost && <p className="note">{t('hostOnly')}</p>}
          <div className="city-grid compact">
            {CITIES.map((c) => (
              <button
                key={c.id} type="button" className={`city-tile${c.id === room.cityId ? ' on' : ''}`} aria-pressed={c.id === room.cityId}
                disabled={!isHost} onClick={() => config(c.id)}
              >
                <CityArt id={c.id} />
                <span className="city-name">{t.l(c.name)}</span>
                <span className="meta">{t(`complexity${c.complexity}`)} · {t('minutes', { a: c.minutes[0], b: c.minutes[1] })}</span>
              </button>
            ))}
          </div>
          <div className="lobby-city">
            <Board city={city} segments={[]} mini label={t.l(city.name)} />
            <div>
              <h3>{t.l(city.name)} — {t.l(city.subtitle)}</h3>
              <ul className="rule-list">{city.rules.map((r, i) => <li key={i}>{t.l(r)}</li>)}</ul>
            </div>
          </div>
          <h2>{t('options')}</h2>
          <fieldset className="options" disabled={!isHost}>
            <label className="check">
              <input type="checkbox" checked={room.settings.modules.includes('objectives')} onChange={() => toggle('objectives')} />
              <span><b>{t('modObjectives')}</b><small>{t('modObjectivesHint')}</small></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={room.settings.modules.includes('specials')} onChange={() => toggle('specials')} />
              <span><b>{t('modSpecials')}</b><small>{t('modSpecialsHint')}</small></span>
            </label>
            {room.settings.modules.length === 2 && <p className="note warn">{t('advancedNote')}</p>}
            <label className="check">
              <input type="checkbox" checked={room.settings.autoPass} onChange={(e) => config(room.cityId, { autoPass: e.target.checked })} />
              <span><b>{t('autoPass')}</b></span>
            </label>
            <label className="select">
              {t('turnTimer')}
              <select
                value={room.settings.turnSeconds}
                onChange={(e) => config(room.cityId, { turnSeconds: Number(e.target.value) as RoomSettings['turnSeconds'] })}
              >
                {TURN_LIMITS.map((n) => <option key={n} value={n}>{n ? t('seconds', { n }) : t('noLimit')}</option>)}
              </select>
            </label>
          </fieldset>
        </section>
      </div>
    </main>
  );
}
