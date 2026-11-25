import { useSyncExternalStore } from 'react';
import { normalizeCode } from '../shared/constants';

export type Route =
  | { page: 'home' }
  | { page: 'cities' }
  | { page: 'tutorial' }
  | { page: 'rules'; city?: string }
  | { page: 'settings' }
  | { page: 'join' }
  | { page: 'room'; code: string }
  | { page: 'notFound' };

export function parseRoute(hash: string): Route {
  const [page = '', arg = ''] = hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case '':
      return { page: 'home' };
    case 'cities':
    case 'tutorial':
    case 'settings':
    case 'join':
      return { page };
    case 'rules':
      return { page, city: arg || undefined };
    case 'room':
      return { page, code: normalizeCode(arg) };
    default:
      return { page: 'notFound' };
  }
}

export const go = (path: string) => {
  location.hash = `#/${path}`;
};

export const inviteLink = (code: string) => `${location.origin}${location.pathname}#/room/${code}`;

export function useHash(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => location.hash,
  );
}
