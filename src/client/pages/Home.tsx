import { useEffect, useMemo, useState } from 'react';
import { CITIES, getCity } from '../../cities';
import { playBotGame } from '../../engine/bot';
import { AVATAR_COUNT, CODE_LENGTH, MAX_NAME, codeFromInput, normalizeCode } from '../../shared/constants';
import { Board } from '../components/Board';
import { Avatar, CityArt, Logo } from '../components/icons';
import { errorText, toast } from '../components/ui';
import { useT } from '../i18n';
import { request, useNet } from '../net';
import { setPrefs, usePrefs } from '../prefs';
import { go } from '../router';

export function IdentityForm() {
  const t = useT();
  const { name, avatar } = usePrefs();
  return (
    <div className="identity">
      <label>
        {t('displayName')}
        <input
          value={name} maxLength={MAX_NAME} placeholder={t('namePlaceholder')} autoComplete="nickname"
          onChange={(e) => setPrefs({ name: e.target.value })}
        />
      </label>
      <fieldset className="avatars">
        <legend>{t('avatar')}</legend>
        {Array.from({ length: AVATAR_COUNT }, (_, i) => (
          <button
            key={i} type="button" className={avatar === i ? 'avatar-pick on' : 'avatar-pick'} aria-pressed={avatar === i}
            aria-label={t('avatarN', { n: i + 1 })} onClick={() => setPrefs({ avatar: i })}
          >
            <Avatar n={i} />
          </button>
        ))}
      </fieldset>
    </div>
  );
}

export function useEnter() {
  const t = useT();
  const prefs = usePrefs();
  const [busy, setBusy] = useState(false);
  const run = async (body: Parameters<typeof request>[0]) => {
    setBusy(true);
    const r = await request(body);
    setBusy(false);
    if (!r.ok) toast(errorText(t, r.error), 'bad');
    return r.ok;
  };
  const me = () => {
    const name = prefs.name.trim();
    if (!name) toast(t('needName'), 'bad');
    return name ? { name, avatar: prefs.avatar } : null;
  };
  return {
    busy,
    create: async (cityId: string) => {
      const who = me();
      return who ? run({ t: 'create', ...who, cityId }) : false;
    },
    join: async (code: string) => {
      const who = me();
      if (!who) return false;
      const c = normalizeCode(code);
      if (c.length !== CODE_LENGTH) {
        toast(t('needCode'), 'bad');
        return false;
      }
      return run({ t: 'join', ...who, code: c });
    },
    leave: () => run({ t: 'leave' }),
  };
}

/** Moves to the room page once the server confirms a seat taken from this page. */
export function useGoToRoom() {
  const { room } = useNet();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed && room) go(`room/${room.code}`);
  }, [armed, room]);
  return () => setArmed(true);
}

export function JoinForm({ initial = '' }: { initial?: string }) {
  const t = useT();
  const net = useNet();
  const enter = useEnter();
  const follow = useGoToRoom();
  const [code, setCode] = useState(initial);
  const online = net.status === 'online';
  return (
    <form
      className="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        void enter.join(code).then((ok) => ok && follow());
      }}
    >
      <label>
        {t('roomCode')}
        <input
          className="code-input" value={code} maxLength={200} placeholder={t('roomCodeHint')} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={(e) => setCode(codeFromInput(e.target.value))}
        />
      </label>
      <button type="submit" className="primary" disabled={enter.busy || !online}>{t('join')}</button>
    </form>
  );
}

export function ResumeBanner() {
  const t = useT();
  const { room } = useNet();
  if (!room) return null;
  return (
    <div className="banner">
      <span>{t('inRoomNow', { code: room.code })}</span>
      <button type="button" className="primary" onClick={() => go(`room/${room.code}`)}>{t('resumeRoom', { code: room.code })}</button>
    </div>
  );
}

/** A finished sample network, drawn by the real engine, as the front-page picture. */
function HeroBoard() {
  const t = useT();
  const [city] = useState(() => CITIES[Math.floor(Math.random() * CITIES.length)]!);
  const segments = useMemo(() => playBotGame(city, 'front-page', 1, 'random', []).players.p1!.segments, [city]);
  return <Board city={city} segments={segments} mini label={t.l(city.name)} />;
}

export function Home() {
  const t = useT();
  const net = useNet();
  const enter = useEnter();
  const follow = useGoToRoom();
  const online = net.status === 'online';
  const create = () => void enter.create(CITIES[0]!.id).then((ok) => ok && follow());
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1><Logo size={64} /> {t('appName')}</h1>
          <p>{t('tagline')}</p>
          <HeroBoard />
        </div>
        <div className="panel start-panel">
          <ResumeBanner />
          <IdentityForm />
          <button type="button" className="primary big" disabled={enter.busy || !online || !!net.room} onClick={create}>{t('create')}</button>
          <JoinForm />
          <div className="row">
            <button type="button" className="ghost" onClick={() => go('tutorial')}>{t('howTo')}</button>
            <button type="button" className="ghost" onClick={() => go('cities')}>{t('cities')}</button>
            <button type="button" className="ghost" onClick={() => go('rules')}>{t('rules')}</button>
          </div>
          {!online && <p className="note">{net.status === 'offline' ? t('serverDown') : t('connecting')}</p>}
        </div>
      </section>
    </main>
  );
}

export function Cities() {
  const t = useT();
  const net = useNet();
  const enter = useEnter();
  const follow = useGoToRoom();
  const [open, setOpen] = useState(CITIES[0]!.id);
  const city = getCity(open)!;
  const online = net.status === 'online';
  return (
    <main className="page">
      <h1>{t('chooseCity')}</h1>
      <div className="city-grid">
        {CITIES.map((c) => (
          <button key={c.id} type="button" className={`city-tile${c.id === open ? ' on' : ''}`} aria-pressed={c.id === open} onClick={() => setOpen(c.id)}>
            <CityArt id={c.id} />
            <span className="city-name">{t.l(c.name)}</span>
            <span>{t.l(c.subtitle)}</span>
            <span className="meta">{t(`complexity${c.complexity}`)} · {t('minutes', { a: c.minutes[0], b: c.minutes[1] })} · {t('playersRange', { n: c.maxPlayers })}</span>
          </button>
        ))}
      </div>
      <section className="panel city-detail">
        <div>
          <h2>{t.l(city.name)} — {t.l(city.subtitle)}</h2>
          <p>{t.l(city.description)}</p>
          <p className="meta">{t('stationsN', { n: city.stations.length })} · {t('districtsN', { n: city.districts.length })}</p>
          <ul className="rule-list">{city.rules.map((r, i) => <li key={i}>{t.l(r)}</li>)}</ul>
          <p className="note">{t.l(city.houseRuleNote)}</p>
        </div>
        <div className="city-play">
          <Board city={city} segments={[]} mini label={t.l(city.name)} />
          <IdentityForm />
          <button
            type="button" className="primary big" disabled={enter.busy || !online || !!net.room}
            onClick={() => void enter.create(city.id).then((ok) => ok && follow())}
          >
            {t('playHere')}
          </button>
          <ResumeBanner />
          {!online && <p className="note">{net.status === 'offline' ? t('serverDown') : t('connecting')}</p>}
        </div>
      </section>
    </main>
  );
}
