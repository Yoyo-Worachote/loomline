import { useState } from 'react';
import { CITIES, getCity } from '../../cities';
import { TRAINING_DECK, trainingCity } from '../../cities/training';
import { otherEnd, indexCity } from '../../engine/network';
import { scoreLine } from '../../engine/scoring';
import type { Segment } from '../../engine/types';
import { SymbolIcon } from '../components/icons';
import { PlayArea } from '../components/PlayArea';
import { CardFace, ConfirmButton, ScoreList, toast } from '../components/ui';
import { useT, type Key } from '../i18n';
import { forgetIdentity, useNet } from '../net';
import { resetPrefs, setPrefs, usePrefs } from '../prefs';
import { go } from '../router';

export function Rules({ city: wanted }: { city?: string }) {
  const t = useT();
  const { room } = useNet();
  const [open, setOpen] = useState(getCity(wanted ?? room?.cityId ?? '')?.id ?? CITIES[0]!.id);
  const city = getCity(open)!;
  return (
    <main className="page prose">
      <h1>{t('rules')}</h1>
      <section className="panel">
        <h2>{t('ru_goal')}</h2>
        <p>{t('ru_goalT')}</p>
        <h2>{t('ru_round')}</h2>
        <p>{t('ru_roundT')}</p>
        <h2>{t('ru_build')}</h2>
        <ul className="rule-list">{(['ru_build1', 'ru_build2', 'ru_build3', 'ru_build4', 'ru_build5'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
        <p className="symbol-row">
          {(['drop', 'leaf', 'spark', 'hex', 'any'] as const).map((s) => <span key={s}><SymbolIcon symbol={s} /> {t(`sym_${s}`)}</span>)}
        </p>
        <h2>{t('ru_cards')}</h2>
        <ul className="rule-list">{(['ru_cardsS', 'ru_cardsW', 'ru_cardsB', 'ru_cardsT', 'ru_cardsX'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
        <h2>{t('ru_pass')}</h2>
        <p>{t('ru_passT')}</p>
        <h2>{t('ru_multi')}</h2>
        <p>{t('ru_multiT')}</p>
      </section>
      <section className="panel">
        <h2>{t('ru_city')}</h2>
        <div className="row" role="group" aria-label={t('ru_city')}>
          {CITIES.map((c) => (
            <button key={c.id} type="button" className={`ghost${c.id === open ? ' on' : ''}`} aria-pressed={c.id === open} onClick={() => setOpen(c.id)}>{t.l(c.name)}</button>
          ))}
        </div>
        <h3>{t.l(city.name)} — {t.l(city.subtitle)}</h3>
        <p>{t.l(city.description)}</p>
        <ul className="rule-list">{city.rules.map((r, i) => <li key={i}>{t.l(r)}</li>)}</ul>
        <p>{t('tieBreak', { list: city.tieBreakers.map((x) => t(`tie_${x}` as Key)).join(', ') })}</p>
        <p className="note"><b>{t('houseRules')}:</b> {t.l(city.houseRuleNote)}</p>
      </section>
    </main>
  );
}

const TUTORIAL_STEPS = 6;

export function Tutorial() {
  const t = useT();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tried, setTried] = useState(false);
  // Steps: 1 leaf, 2 refused tap, 3 spark, 4 wild, 5 branch, 6 score.
  const built = segments.length;
  const step = built === 0 ? 1 : built === 1 ? (tried ? 3 : 2) : built + 2;
  const done = built >= TRAINING_DECK.length;
  const card = TRAINING_DECK[Math.min(built, TRAINING_DECK.length - 1)]!;
  const text = t(`tu_${step}` as Key);
  const restart = () => {
    setSegments([]);
    setTried(false);
  };
  return (
    <main className="page tutorial">
      <h1>{t('tu_title')}</h1>
      <div className="tutorial-grid">
        <div className="game-main">
          <PlayArea
            city={trainingCity} segments={segments} line="lapis" card={card} deciding={!done} turn={`${built}`} prompt={t('step', { n: step, total: TUTORIAL_STEPS })}
            waiting={t('step', { n: step, total: TUTORIAL_STEPS })}
            onRefused={() => built === 1 && setTried(true)}
            onBuild={async (m) => {
              const e = indexCity(trainingCity).edge.get(m.edge)!;
              setSegments((s) => [...s, { edge: m.edge, from: m.from, to: otherEnd(e, m.from), line: 'lapis', round: 0, reveal: s.length }]);
              return true;
            }}
          />
        </div>
        <aside>
          <section className="panel" aria-live="polite">
            <h2>{t('step', { n: step, total: TUTORIAL_STEPS })}</h2>
            <p>{text}</p>
            {!done && <CardFace card={card} big />}
            {done && <ScoreList parts={scoreLine(trainingCity, segments, 'lapis').parts} city={trainingCity} />}
            <div className="row">
              <button type="button" className="ghost" onClick={restart} disabled={!built}>{t('tu_restart')}</button>
              {done && <button type="button" className="primary" onClick={() => go('cities')}>{t('tu_finish')}</button>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function Settings() {
  const t = useT();
  const p = usePrefs();
  const check = (key: 'sound' | 'animation' | 'contrast' | 'bigSymbols') => (
    <label className="check">
      <input type="checkbox" checked={p[key]} onChange={(e) => setPrefs({ [key]: e.target.checked })} />
      <span><b>{t(key)}</b></span>
    </label>
  );
  return (
    <main className="page prose">
      <h1>{t('settings')}</h1>
      <section className="panel options">
        <label className="select">
          {t('lang')}
          <select value={p.lang} onChange={(e) => setPrefs({ lang: e.target.value === 'en' ? 'en' : 'th' })}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="select">
          {t('zoomPref')}
          <select value={p.zoom} onChange={(e) => setPrefs({ zoom: e.target.value === 'large' ? 'large' : 'fit' })}>
            <option value="fit">{t('zoomFit')}</option>
            <option value="large">{t('zoomLarge')}</option>
          </select>
        </label>
        {check('sound')}
        {check('animation')}
        {check('contrast')}
        {check('bigSymbols')}
        <p className="note">{t('settingsNote')}</p>
      </section>
      <section className="panel">
        <h2>{t('privacy')}</h2>
        <p>{t('privacyText')}</p>
        <ConfirmButton
          className="ghost" label={t('clearData')} question={t('clearConfirm')}
          onConfirm={() => {
            resetPrefs();
            void forgetIdentity();
            toast(t('cleared'));
          }}
        />
      </section>
    </main>
  );
}
