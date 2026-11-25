import { Component, useEffect, type ReactNode } from 'react';
import { Logo } from './components/icons';
import { Toaster, toast } from './components/ui';
import { makeTranslator, useT } from './i18n';
import { clearGone, startNet, useNet } from './net';
import { Cities, Home, IdentityForm, JoinForm, ResumeBanner, useEnter } from './pages/Home';
import { Game } from './pages/Game';
import { Rules, Settings, Tutorial } from './pages/Info';
import { Lobby } from './pages/Lobby';
import { FinalResults, RoundResults } from './pages/Results';
import { getPrefs, setPrefs, usePrefs } from './prefs';
import { go, parseRoute, useHash } from './router';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    console.error(e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = makeTranslator(getPrefs().lang);
    return (
      <main className="page center-page">
        <h1>{t('errorTitle')}</h1>
        <p>{t('errorBody')}</p>
        <button type="button" className="primary" onClick={() => location.reload()}>{t('reload')}</button>
      </main>
    );
  }
}

function RoomPage({ code }: { code: string }) {
  const t = useT();
  const net = useNet();
  const enter = useEnter();
  const { room, you } = net;

  if (!net.resolved)
    return (
      <main className="page center-page">
        <span className="spinner" aria-hidden="true" />
        <p>{net.status === 'offline' ? t('serverDown') : t('connecting')}</p>
      </main>
    );
  if (!room)
    return (
      <main className="page center-page">
        <section className="panel">
          <h1>{t('join')}</h1>
          <IdentityForm />
          <JoinForm initial={code} key={code} />
        </section>
      </main>
    );
  if (code && room.code !== code)
    return (
      <main className="page center-page">
        <section className="panel">
          <h1>{t('otherRoom', { code: room.code })}</h1>
          <div className="row">
            <button type="button" className="primary" onClick={() => go(`room/${room.code}`)}>{t('resumeRoom', { code: room.code })}</button>
            <button
              type="button" className="ghost" disabled={enter.busy}
              onClick={() => void enter.leave().then((ok) => ok && enter.join(code))}
            >
              {t('leaveAndJoin', { code })}
            </button>
          </div>
        </section>
      </main>
    );
  const game = room.game;
  if (!game) return <Lobby room={room} you={you} />;
  if (game.phase === 'playing') return <Game room={room} game={game} you={you} />;
  if (game.phase === 'roundScoring') return <RoundResults room={room} game={game} you={you} />;
  return <FinalResults room={room} game={game} you={you} />;
}

function Header() {
  const t = useT();
  const { lang } = usePrefs();
  const net = useNet();
  return (
    <header className="top">
      <a className="brand" href="#/"><Logo size={34} /> <span>{t('appName')}</span></a>
      <nav aria-label={t('menu')}>
        {net.room && <a className="nav-room" href={`#/room/${net.room.code}`}>{net.room.code}</a>}
        <a href="#/cities">{t('cities')}</a>
        <a href="#/rules">{t('rules')}</a>
        <a href="#/tutorial">{t('howTo')}</a>
        <a href="#/settings">{t('settings')}</a>
      </nav>
      <div className="lang" role="group" aria-label={t('lang')}>
        <button type="button" aria-pressed={lang === 'th'} onClick={() => setPrefs({ lang: 'th' })}>ไทย</button>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setPrefs({ lang: 'en' })}>EN</button>
      </div>
    </header>
  );
}

export function App() {
  const t = useT();
  const net = useNet();
  const route = parseRoute(useHash());

  useEffect(startNet, []);
  useEffect(() => {
    if (!net.gone) return;
    toast(t(net.gone === 'kicked' ? 'roomGone_kicked' : 'roomGone_expired'), 'bad');
    clearGone();
    go('');
  }, [net.gone, t]);
  const pageKey = route.page;
  useEffect(() => {
    // Newer browsers return a promise here, which must not become the effect's cleanup.
    void window.scrollTo(0, 0);
  }, [pageKey, net.room?.phase]);

  let page: ReactNode;
  switch (route.page) {
    case 'home':
      page = <Home />;
      break;
    case 'cities':
      page = <Cities />;
      break;
    case 'join':
      page = (
        <main className="page center-page">
          <section className="panel">
            <h1>{t('join')}</h1>
            <ResumeBanner />
            <IdentityForm />
            <JoinForm />
          </section>
        </main>
      );
      break;
    case 'rules':
      page = <Rules city={route.city} />;
      break;
    case 'tutorial':
      page = <Tutorial />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    case 'room':
      page = <RoomPage code={route.code} />;
      break;
    default:
      page = (
        <main className="page center-page">
          <h1>{t('notFound')}</h1>
          <a className="button primary" href="#/">{t('home')}</a>
        </main>
      );
  }

  return (
    <>
      <Header />
      {net.status === 'offline' && net.room && <div className="conn-bar" role="alert">{t('reconnecting')}</div>}
      {page}
      <Toaster />
    </>
  );
}
