# Progress

Last updated: 2026-11-25

## Status

All stages in `CLAUDE.md` have a working implementation. The app is playable end to end on localhost, solo or with several players, in all four cities.

| Stage | State |
| --- | --- |
| 0 Discovery | Folder held only the two spec files; not a git repository (none was created) |
| 1 Game engine | Done |
| 2 Multiplayer | Done: Node WebSocket server, server-authoritative |
| 3 London | Done |
| 4 Tokyo, Paris, Berlin | Done: each has its own map and rules; objectives and special cards are optional modules |
| 5 UI/UX | Done: home, gallery, lobby, game, results, tutorial, rules, settings; Thai default, English |
| 6 Hardening | Done for local use; see "Not verified" |

## Decisions to know about

- **Name.** The app is called Loomline. "Next Station" is an existing published game, so its name, look, maps and values are not used. The name lives in `appName` (`src/client/i18n.ts`), `index.html`, and `package.json`.
- **No Supabase.** One Node process serves the client and WebSocket and saves rooms as JSON. Reasons and the extension point are in `README.md`.
- **Symbols** are drop, leaf, spark and hexagon rather than plain geometric shapes.
- **Plain CSS** instead of Tailwind.

## Verified

- `npm run check`: lint, typecheck, 129 tests, production build. `npm audit`: 0 vulnerabilities.
- Tests cover engine rules, scoring, city data, full bot games with replay for every city, the server over real WebSockets, and the interface in jsdom.
- In a real browser, two tabs with separate identities (desktop 1360×860 and mobile 375×812): create, join by link, ready, start, synchronised cards and moves, refusal messages, a full London game to final results (a tie, decided by tie-breaker), rematch, abandon game, Berlin, Tokyo and Paris boards in play, language switch, zoom and pan, leaving.
- The server was stopped and restarted mid-game; both tabs resumed the same game.

- Public hosting preparation: `render.yaml`, invite panel (code, link, share sheet, QR), pasted links accepted as codes, keep-awake ping, per-visitor limits behind a proxy. A clean copy of `_upload` was installed, built and started with Render's settings on this machine, including a WebSocket with a public host and origin.

## Not verified

- Internet deployment, HTTPS/`wss`, and play from separate physical devices.
- The `Dockerfile` (Docker is not available here).
- Real touch hardware and pinch zoom; screen readers.
- Balance with human players. Bots only: see `npm run simulate`.

## Known limits

- One server process per deployment; rooms live in its memory plus `DATA_DIR`.
- A player who leaves during a game cannot rejoin it. Disconnecting is fine.
- No public matchmaking and no AI opponents (neither is in the MVP).

## Next recommended task

Upload `_upload` to GitHub and deploy it with the Render Blueprint (README, Deployment), then play one full game from two physical devices, and fix what that shows. After that: tune scoring from real play.

## Bugs found and fixed while testing

- Blank page on navigation: newer browsers return a promise from `scrollTo`, which React treated as an effect cleanup.
- Rate-limited requests were acknowledged without their id, leaving the client waiting for a timeout.
- No way to leave the room from the round results page.
- District labels ran off the map edge; zoom buttons covered stations.
- The browser bundle included the server's validation library.

## Files

- `src/engine/` rules, `src/cities/` packs, `src/shared/` protocol, `src/server/` server, `src/client/` interface
- `tests/`, `scripts/`, `docs/GAME_RULES.md`, `docs/CITY_PACKS.md`, `README.md`
- `render.yaml`; `_upload/` is a generated copy for GitHub web upload, not a source folder
- `start.cmd`, `Dockerfile`, `.env.example`, `.claude/launch.json` (preview configuration)
- `CLAUDE.md` and `NEXT_STATION_WEBAPP_SPEC.md` are unchanged
