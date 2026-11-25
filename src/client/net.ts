import { useSyncExternalStore } from 'react';
import type { ClientBody, ErrorCode, RoomView, ServerMessage } from '../shared/protocol';
import { readStore, writeStore } from './prefs';

export interface NetState {
  status: 'connecting' | 'online' | 'offline';
  /** The server has told us whether we hold a seat. */
  resolved: boolean;
  room: RoomView | null;
  you: string;
  /** Why we last lost a room. */
  gone: 'kicked' | 'expired' | null;
  /** serverTime - local time, for countdowns. */
  clockSkew: number;
  attempts: number;
}

export type Result = { ok: true } | { ok: false; error: ErrorCode };

let state: NetState = { status: 'connecting', resolved: false, room: null, you: '', gone: null, clockSkew: 0, attempts: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<NetState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

let ws: WebSocket | null = null;
let rid = 0;
let started = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, { resolve: (r: Result) => void; timer: ReturnType<typeof setTimeout> }>();

function settle(id: number, r: Result) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(r);
}

function sendNow(body: ClientBody): Promise<Result> {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, error: 'offline' });
    const id = ++rid;
    pending.set(id, { resolve, timer: setTimeout(() => settle(id, { ok: false, error: 'timeout' }), 8000) });
    ws.send(JSON.stringify({ rid: id, ...body }));
  });
}

/** Send an action. Never throws; failures come back as error codes. */
export function request(body: ClientBody): Promise<Result> {
  if (state.status !== 'online') return Promise.resolve({ ok: false, error: 'offline' });
  return sendNow(body);
}

function onMessage(m: ServerMessage) {
  if (m.t === 'ack') {
    if (m.ok && m.token) writeStore('token', m.token);
    settle(m.rid, m.ok ? { ok: true } : { ok: false, error: m.error });
  } else if (m.t === 'room') {
    // Revisions only move forward within one room, so an out-of-order frame is ignored.
    if (state.room && state.room.code === m.room.code && m.room.revision < state.room.revision && state.status === 'online') return;
    set({ room: m.room, you: m.you, resolved: true, gone: null, clockSkew: m.room.serverTime - Date.now() });
  } else {
    // "none" while we still show a room means the server restarted without it.
    const lost = m.reason === 'expired' || (m.reason === 'none' && state.room !== null);
    set({ room: null, you: '', resolved: true, gone: m.reason === 'kicked' ? 'kicked' : lost ? 'expired' : state.gone });
  }
}

function open() {
  clearTimeout(retryTimer);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    const token = readStore('token') ?? undefined;
    void sendNow({ t: 'hello', token }).then((r) => {
      if (r.ok) set({ status: 'online', attempts: 0 });
      else sock.close();
    });
  };
  sock.onmessage = (e) => {
    try {
      onMessage(JSON.parse(String(e.data)) as ServerMessage);
    } catch (err) {
      console.warn('ignored malformed server message', err);
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    for (const id of [...pending.keys()]) settle(id, { ok: false, error: 'offline' });
    const attempts = state.attempts + 1;
    set({ status: 'offline', attempts });
    retryTimer = setTimeout(open, Math.min(8000, 400 * 2 ** Math.min(attempts, 5)) * (0.75 + Math.random() / 2));
  };
}

export function startNet() {
  if (started) return;
  started = true;
  open();
  const nudge = () => {
    if (state.status === 'offline' && !ws) open();
  };
  // Free hosts put an idle server to sleep. Ordinary traffic keeps it awake while someone is in a room.
  setInterval(() => {
    if (state.room && state.status === 'online') fetch('/healthz', { cache: 'no-store' }).catch(() => {});
  }, 4 * 60_000);
  window.addEventListener('online', nudge);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && nudge());
}

export const clearGone = () => set({ gone: null });

/** Leave any room, drop the identity held on this device and reconnect as a stranger. */
export async function forgetIdentity() {
  if (state.room) await request({ t: 'leave' });
  writeStore('token', null);
  set({ room: null, you: '', resolved: false });
  ws?.close();
}

export function useNet(): NetState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
