// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCity } from '../src/cities';
import { applyAction, createGame, playerLegalMoves, turnKey } from '../src/engine/game';
import { playBotGame } from '../src/engine/bot';
import type { CityPack, GameState, ModuleId } from '../src/engine/types';
import { gameView } from '../src/server/rooms';
import { DICT_FOR_TEST, translate } from '../src/client/i18n';
import { parseRoute } from '../src/client/router';
import { resetPrefs, setPrefs } from '../src/client/prefs';
import type { ClientBody, RoomView, ServerMessage } from '../src/shared/protocol';

/** In-memory stand-in for the browser WebSocket. */
class FakeSocket {
  static OPEN = 1;
  static current: FakeSocket;
  readyState = 1;
  ready = false;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  sent: (ClientBody & { rid: number })[] = [];
  reply: (m: ClientBody) => { ok: true } | { ok: false; error: string } = () => ({ ok: true });
  constructor() {
    FakeSocket.current = this;
    queueMicrotask(() => this.onopen?.());
  }
  send(s: string) {
    const m = JSON.parse(s) as ClientBody & { rid: number };
    this.sent.push(m);
    const r = m.t === 'hello' ? { ok: true, token: 'x'.repeat(32) } : this.reply(m);
    queueMicrotask(() => {
      this.push({ t: 'ack', rid: m.rid, ...r } as ServerMessage);
      if (m.t === 'hello') this.ready = true;
    });
  }
  push(m: ServerMessage) {
    act(() => this.onmessage?.({ data: JSON.stringify(m) }));
  }
  close() {
    this.readyState = 3;
    act(() => this.onclose?.());
  }
}

let App: typeof import('../src/client/App').App;

beforeAll(async () => {
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('scrollTo', () => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  ({ App } = await import('../src/client/App'));
});
beforeEach(() => {
  resetPrefs();
  location.hash = '';
});
afterEach(() => {
  if (FakeSocket.current) FakeSocket.current.push({ t: 'noRoom', reason: 'left' });
  cleanup();
});

let revision = 0;
function roomView(game: GameState | null, over: Partial<RoomView> = {}): RoomView {
  const player = (id: string, name: string, seat: number) => ({
    id, name, avatar: seat, seat, ready: seat > 0, connected: true, continued: false, left: false,
  });
  return {
    code: 'ABCDEF', revision: ++revision, hostId: 'p1', phase: game?.phase ?? 'lobby', cityId: game?.cityId ?? 'london',
    settings: { modules: [], turnSeconds: 0, autoPass: true }, players: [player('p1', 'มะลิ', 0), player('p2', 'Bo', 1)],
    paused: false, game: game ? gameView(game) : null, deadline: null, serverTime: Date.now(), expiresAt: Date.now() + 1e6, history: [],
    ...over,
  };
}

async function show(room: RoomView | null, hash = room ? `#/room/${room.code}` : '', you = 'p1') {
  location.hash = hash;
  const view = render(<App />);
  await waitFor(() => expect(FakeSocket.current?.readyState === 1 && FakeSocket.current.ready).toBe(true), { timeout: 5000 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  if (room) FakeSocket.current.push({ t: 'room', room, you });
  else FakeSocket.current.push({ t: 'noRoom', reason: 'none' });
  FakeSocket.current.sent = [];
  return view;
}

const last = () => FakeSocket.current.sent.at(-1);
const station = (c: HTMLElement, id: string) => c.querySelector<SVGGElement>(`[data-station="${id}"]`)!;

function newGame(cityId = 'london', modules: ModuleId[] = []): { city: CityPack; game: GameState } {
  const city = getCity(cityId)!;
  return { city, game: createGame({ city, seed: 'ui', players: ['p1', 'p2'], modules }) };
}

describe('text', () => {
  it('has both languages and matching placeholders for every key', () => {
    const vars = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join();
    for (const [k, [th, en]] of Object.entries(DICT_FOR_TEST)) {
      expect(th.length, k).toBeGreaterThan(0);
      expect(en.length, k).toBeGreaterThan(0);
      expect(vars(th), k).toBe(vars(en));
    }
    expect(translate('en', 'round', { n: 2 })).toBe('Round 2 of 4');
  });

  it('covers every rule, objective and error the engine can produce', () => {
    for (const id of ['london', 'tokyo', 'paris', 'berlin']) {
      const c = getCity(id)!;
      for (const r of [...c.lineRules, ...c.finalRules]) expect(DICT_FOR_TEST).toHaveProperty(`r_${r.type}`);
      for (const o of c.objectives) expect(DICT_FOR_TEST).toHaveProperty(`o_${o.rule.type}`);
      for (const x of c.tieBreakers) expect(DICT_FOR_TEST).toHaveProperty(`tie_${x}`);
    }
  });

  it('starts in Thai and switches to English and back', async () => {
    const user = userEvent.setup();
    await show(null);
    expect(screen.getByRole('button', { name: 'สร้างห้อง' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'Create room' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(screen.getByRole('button', { name: 'สร้างห้อง' })).toBeInTheDocument();
  });
});

describe('routing and entry', () => {
  it('parses routes', () => {
    expect(parseRoute('#/room/ab-cdef')).toEqual({ page: 'room', code: 'ABCDEF' });
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('#/nope')).toEqual({ page: 'notFound' });
  });

  it('asks for a name before creating, then sends the request', async () => {
    const user = userEvent.setup();
    await show(null);
    await user.click(screen.getByRole('button', { name: 'สร้างห้อง' }));
    expect(screen.getByText('กรอกชื่อก่อน')).toBeInTheDocument();
    expect(FakeSocket.current.sent).toHaveLength(0);
    await user.type(screen.getByLabelText('ชื่อที่แสดง'), 'มะลิ');
    await user.click(screen.getByRole('button', { name: 'สร้างห้อง' }));
    expect(last()).toMatchObject({ t: 'create', name: 'มะลิ', cityId: 'london' });
  });

  it('prefills the code from an invite link and shows server errors', async () => {
    const user = userEvent.setup();
    setPrefs({ name: 'Bo', lang: 'en' });
    await show(null, '#/room/QWERTY');
    FakeSocket.current.reply = () => ({ ok: false, error: 'roomNotFound' });
    expect(screen.getByLabelText('Room code')).toHaveValue('QWERTY');
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    expect(last()).toMatchObject({ t: 'join', code: 'QWERTY' });
    expect(await screen.findByText('Room not found. Check the code')).toBeInTheDocument();
    FakeSocket.current.reply = () => ({ ok: true });
  });

  it('shows a page for unknown addresses', async () => {
    await show(null, '#/nowhere');
    expect(screen.getByText('ไม่พบหน้านี้')).toBeInTheDocument();
  });

  it('renders rules for every city with a house-rule note', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    await show(null, '#/rules');
    for (const name of ['London', 'Tokyo', 'Paris', 'Berlin']) {
      await user.click(screen.getByRole('button', { name }));
      expect(screen.getByText(/House rules:/)).toBeInTheDocument();
    }
  });

  it('changes and clears settings', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en', name: 'Bo' });
    await show(null, '#/settings');
    await user.click(screen.getByLabelText('Higher contrast'));
    expect(document.documentElement.dataset.contrast).toBe('high');
    await user.click(screen.getByLabelText('Animation'));
    expect(document.documentElement.dataset.motion).toBe('off');
    await user.click(screen.getByRole('button', { name: 'Clear data on this device' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear data on this device' }));
    expect(document.documentElement.dataset.contrast).toBe('normal');
  });
});

describe('inviting', () => {
  it('offers a code, a link, a QR code and the system share sheet', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await show(roomView(null));
    const link = `${location.origin}/#/room/ABCDEF`;
    expect(screen.getByLabelText('Invite link')).toHaveValue(link);
    expect(screen.getByRole('img', { name: 'QR code to join room ABCDEF' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share with friends' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: link }));
    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await navigator.clipboard.readText()).toBe(link);
    Reflect.deleteProperty(navigator, 'share');
  });

  it('accepts a whole pasted link where a code is expected', async () => {
    const user = userEvent.setup();
    setPrefs({ name: 'Bo', lang: 'en' });
    await show(null, '#/join');
    await user.click(screen.getByLabelText('Room code'));
    await user.paste('https://loomline.example/#/room/qwerty');
    expect(screen.getByLabelText('Room code')).toHaveValue('QWERTY');
    await user.click(screen.getByRole('button', { name: 'Join room' }));
    expect(last()).toMatchObject({ t: 'join', code: 'QWERTY' });
  });

  it('says so when the server no longer has the room', async () => {
    setPrefs({ lang: 'en' });
    await show(roomView(null));
    FakeSocket.current.push({ t: 'noRoom', reason: 'none' });
    expect(await screen.findByText(/This room has closed/)).toBeInTheDocument();
  });
});

describe('lobby', () => {
  it('gives the host controls and sends configuration', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    await show(roomView(null));
    await user.click(screen.getByRole('button', { name: /Tokyo/ }));
    expect(last()).toMatchObject({ t: 'config', cityId: 'tokyo' });
    await user.click(screen.getByLabelText(/Special cards/));
    expect(last()).toMatchObject({ t: 'config', settings: { modules: ['specials'] } });
    await user.selectOptions(screen.getByLabelText(/Time per card/), '90');
    expect(last()).toMatchObject({ t: 'config', settings: { turnSeconds: 90 } });
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(last()).toMatchObject({ t: 'start' });
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(last()).toMatchObject({ t: 'kick', playerId: 'p2' });
  });

  it('keeps Start disabled until guests are ready, and locks options for guests', async () => {
    setPrefs({ lang: 'en' });
    const room = roomView(null);
    room.players[1]!.ready = false;
    const { unmount } = await show(room);
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
    expect(screen.getByText(/Waiting for everyone/)).toBeInTheDocument();
    unmount();
    await show(roomView(null), undefined, 'p2');
    expect(screen.getByRole('button', { name: /Tokyo/ })).toBeDisabled();
    expect(screen.getByText('Waiting for the host to start')).toBeInTheDocument();
  });
});

describe('playing', () => {
  it('highlights exactly the legal destinations', async () => {
    const { city, game } = newGame();
    const { container } = await show(roomView(game));
    const legal = new Set(playerLegalMoves(game, city, 'p1').map((m) => m.to));
    const shown = new Set([...container.querySelectorAll<SVGGElement>('.station.target')].map((e) => e.dataset.station));
    expect(legal.size).toBeGreaterThan(0);
    expect(shown).toEqual(legal);
  });

  it('previews, cancels, then confirms a segment', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { city, game } = newGame();
    const { container } = await show(roomView(game));
    const m = playerLegalMoves(game, city, 'p1')[0]!;
    expect(screen.getByRole('button', { name: 'Confirm segment' })).toBeDisabled();
    await user.click(station(container, m.to));
    expect(screen.getByTestId('preview')).toBeInTheDocument();
    expect(FakeSocket.current.sent).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('preview')).toBeNull();
    fireEvent.keyDown(station(container, m.to), { key: 'Enter' });
    await user.click(screen.getByRole('button', { name: 'Confirm segment' }));
    expect(last()).toMatchObject({ t: 'build', from: m.from, edge: m.edge, turn: turnKey(game, 'p1') });
  });

  it('lets every legal move be chosen from a list, without the map', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { city, game } = newGame();
    await show(roomView(game));
    const m = playerLegalMoves(game, city, 'p1').at(-1)!;
    await user.selectOptions(screen.getByLabelText(/Choose from a list/), `${m.from}|${m.edge}`);
    await user.click(screen.getByRole('button', { name: 'Confirm segment' }));
    expect(last()).toMatchObject({ t: 'build', edge: m.edge });
  });

  it('explains why a station cannot be reached', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { city, game } = newGame();
    const { container } = await show(roomView(game));
    const start = city.lines.find((l) => l.id === game.lineOrder[0])!.starts[0]!;
    const s = city.stations.find((x) => x.id === start)!;
    const far = city.stations.reduce((a, b) => (Math.hypot(a.x - s.x, a.y - s.y) > Math.hypot(b.x - s.x, b.y - s.y) ? a : b));
    await user.click(station(container, far.id));
    expect(screen.getAllByText('No direct track from your endpoints to this station').length).toBeGreaterThan(0);
    expect(FakeSocket.current.sent).toHaveLength(0);
  });

  it('needs two presses to pass when moves exist', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { game } = newGame();
    await show(roomView(game));
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    expect(FakeSocket.current.sent).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Press again to pass' }));
    expect(last()).toMatchObject({ t: 'pass' });
  });

  it('shows waiting state after submitting and lets you inspect other boards', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { city, game } = newGame();
    const m = playerLegalMoves(game, city, 'p1')[0]!;
    const r = applyAction(game, city, { type: 'build', playerId: 'p1', turn: turnKey(game, 'p1'), from: m.from, edge: m.edge });
    if (!r.ok) throw new Error(r.reason);
    const { container } = await show(roomView(r.state));
    expect(screen.getByText('Submitted. Waiting for 1 more')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm segment' })).toBeNull();
    expect(container.querySelector(`[data-edge="${m.edge}"]`)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /Bo/ }));
    expect(container.querySelector(`[data-edge="${m.edge}"]`)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to my board' }));
    expect(container.querySelector(`[data-edge="${m.edge}"]`)).not.toBeNull();
  });

  it('shows pause, offline players with a host skip control, and a reconnect notice', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { game } = newGame();
    const room = roomView(game);
    room.players[1]!.connected = false;
    await show(room);
    await user.click(screen.getByRole('button', { name: 'Skip turn' }));
    expect(last()).toMatchObject({ t: 'skip', playerId: 'p2' });
    FakeSocket.current.push({ t: 'room', room: { ...room, paused: true, revision: ++revision }, you: 'p1' });
    expect(screen.getByRole('heading', { name: 'Game paused' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm segment' })).toBeNull();
    FakeSocket.current.close();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    // It reconnects by itself and says hello with the stored identity.
    const old = FakeSocket.current;
    await waitFor(() => expect(FakeSocket.current).not.toBe(old), { timeout: 4000 });
    await waitFor(() => expect(FakeSocket.current.sent[0]).toMatchObject({ t: 'hello', token: 'x'.repeat(32) }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('ignores an older room revision', async () => {
    setPrefs({ lang: 'en' });
    const room = roomView(newGame().game, { paused: true });
    await show(room);
    FakeSocket.current.push({ t: 'room', room: { ...room, paused: false, revision: room.revision - 1 }, you: 'p1' });
    expect(screen.getByRole('heading', { name: 'Game paused' })).toBeInTheDocument();
  });

  it.each(['london', 'tokyo', 'paris', 'berlin'])('renders a %s game in both languages without errors', async (id) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { city, game } = newGame(id, ['objectives', 'specials']);
    const { container } = await show(roomView(game));
    expect(container.querySelectorAll('[data-station]')).toHaveLength(city.stations.length);
    act(() => setPrefs({ lang: 'en' }));
    expect(screen.getByText('Round 1 of 4')).toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('results', () => {
  function roundDone() {
    const { city, game } = newGame();
    let s = game;
    while (s.phase === 'playing') {
      const id = ['p1', 'p2'].find((x) => s.players[x]!.status === 'deciding')!;
      const r = applyAction(s, city, { type: 'pass', playerId: id, turn: turnKey(s, id) });
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    return s;
  }

  it('shows round scores and lets the host stop waiting', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const s = roundDone();
    const room = roomView(s);
    await show(room);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(last()).toMatchObject({ t: 'continue', round: 0 });
    const waiting = { ...room, revision: ++revision, players: room.players.map((p) => ({ ...p, continued: p.id === 'p1' })) };
    FakeSocket.current.push({ t: 'room', room: waiting, you: 'p1' });
    await user.click(screen.getByRole('button', { name: 'Continue without waiting' }));
    expect(last()).toMatchObject({ t: 'continue', force: true });
  });

  it.each(['london', 'tokyo', 'paris', 'berlin'])('shows the full %s breakdown with totals that add up', async (id) => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const city = getCity(id)!;
    const end = playBotGame(city, 'ui-final', 2, 'greedy', ['objectives']);
    const { container } = await show(roomView(end));
    const totals = end.ranking!.map((r) => `${r.total}`);
    expect([...container.querySelectorAll('tfoot td')].map((x) => x.textContent)).toEqual(totals);
    for (let col = 0; col < totals.length; col++) {
      const cells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[col]!.querySelector('b')!.textContent!);
      expect(cells.reduce((s, x) => s + Number(x.replace('−', '-')), 0)).toBe(Number(totals[col]));
    }
    await user.click(screen.getByRole('button', { name: /Play again/ }));
    expect(last()).toMatchObject({ t: 'rematch' });
  });
});

describe('tutorial', () => {
  it('can be completed and explains a wrong tap on the way', async () => {
    const user = userEvent.setup();
    setPrefs({ lang: 'en' });
    const { container } = await show(null, '#/tutorial');
    const confirm = () => user.click(screen.getByRole('button', { name: 'Confirm segment' }));
    await user.click(station(container, 'b'));
    await confirm();
    expect(screen.getAllByText('Step 2 of 6').length).toBeGreaterThan(0);
    await user.click(station(container, 'c'));
    expect(screen.getAllByText('The station symbol does not match the card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Step 3 of 6').length).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const target = container.querySelector<SVGGElement>('.station.target')!;
      await user.click(target);
      await confirm();
    }
    expect(screen.getByRole('button', { name: 'Play for real' })).toBeInTheDocument();
  });
});
