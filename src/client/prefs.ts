import { useSyncExternalStore } from 'react';

export type Lang = 'th' | 'en';

export interface Prefs {
  lang: Lang;
  sound: boolean;
  animation: boolean;
  zoom: 'fit' | 'large';
  contrast: boolean;
  bigSymbols: boolean;
  name: string;
  avatar: number;
}

const DEFAULTS: Prefs = {
  lang: 'th', sound: true, animation: true, zoom: 'fit', contrast: false, bigSymbols: false, name: '', avatar: 0,
};

/** `?as=2` gives a tab its own identity so one browser can seat several local players. */
const profile = (() => {
  const p = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('as');
  return p && /^\w{1,12}$/.test(p) ? `.${p}` : '';
})();
export const storageKey = (name: string) => `loomline${profile}.${name}`;

// Storage can be unavailable (private mode, blocked cookies); the app then runs with in-memory preferences.
export function readStore(name: string): string | null {
  try {
    return localStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}
export function writeStore(name: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), value);
  } catch {
    /* ignore */
  }
}

function load(): Prefs {
  try {
    const raw = JSON.parse(readStore('prefs') ?? '{}') as Partial<Prefs>;
    const p = { ...DEFAULTS, ...raw };
    return p.lang === 'th' || p.lang === 'en' ? p : { ...p, lang: 'th' };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.lang = prefs.lang;
  el.dataset.motion = prefs.animation ? 'on' : 'off';
  el.dataset.contrast = prefs.contrast ? 'high' : 'normal';
}
apply();

export const getPrefs = () => prefs;

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  writeStore('prefs', JSON.stringify(prefs));
  apply();
  for (const l of listeners) l();
}

export function resetPrefs() {
  writeStore('prefs', null);
  prefs = DEFAULTS;
  apply();
  for (const l of listeners) l();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}
