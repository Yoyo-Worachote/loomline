# Loomline

เกมเปิดการ์ดแล้ววาดเส้นทางรถไฟบนเว็บ เล่นได้ 1–4 คน เลือกเมืองได้ 4 เมือง (ลอนดอน โตเกียว ปารีส เบอร์ลิน) ภาษาไทยเป็นค่าเริ่มต้น สลับเป็นอังกฤษได้

An original browser flip-and-draw transit game for 1–4 players. Maps, symbols, artwork, card decks and scoring values were made for this project. The working folder is called *NextStation_Online*; the app itself uses its own name and does not reproduce any published board game.

## Quick start (Windows)

Double-click `start.cmd`, or run it from a terminal:

```powershell
.\start.cmd
```

It finds Node (from PATH, or the portable copy in `D:\Project\.node`), installs packages if needed, builds, and starts the game at <http://localhost:8787>. The console also prints the address other devices on the same network can use.

## Manual commands

Requires Node 20 or newer. If `node` is not on PATH, first run:

```powershell
$env:PATH = "D:\Project\.node\node-v22.23.3-win-x64;$env:PATH"
```

| Command | What it does |
| --- | --- |
| `npm install` | Install packages |
| `npm run dev` | Development: server on 8787, Vite with hot reload on 5173 |
| `npm run build` | Production build into `dist/` |
| `npm start` | Run the production build |
| `npm test` | All tests |
| `npm run check` | Lint, typecheck, tests and build |
| `npm run simulate -- 60` | Bot games per city, for balance checks |
| `npx tsx scripts/inspect-cities.ts out` | Map statistics and SVG proofs |

### Several players on one computer

A browser profile is one player. Add `?as=2` (or any short word) before the `#` to give a tab its own identity:

- `http://localhost:8787/?as=1`
- `http://localhost:8787/?as=2`

## Configuration

No configuration or secret is required. See `.env.example`; pass it with `node --env-file=.env dist/server.mjs`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` | Room snapshots; `memory` disables them |
| `ROOM_TTL_HOURS` | `12` | Idle time before a room is deleted |
| `ALLOWED_ORIGINS` | empty | Extra browser origins. Empty means same host only |
| `TRUST_PROXY` | `0` | `1` only behind a trusted reverse proxy |
| `CLIENT_IP_HEADER` | empty | Header the host sets to the visitor's address, e.g. `cf-connecting-ip` |

## Architecture

```
src/engine   Pure rules: moves, rounds, scoring, seeded RNG, replay. No I/O.
src/cities   Data-driven city packs, compiled to a graph.
src/shared   Wire protocol and zod schemas.
src/server   Node HTTP + WebSocket server, rooms, timers, persistence.
src/client   React + SVG interface.
tests        Engine, scoring, city data, live WebSocket and UI tests.
```

- **Server-authoritative.** Clients send intents (`build`, `pass`). The server draws cards, checks legality and scores. The seed and the undrawn deck are not sent until the game ends.
- **Concurrency.** Room actions run synchronously on one thread, so each is atomic. Every submission carries a turn key; duplicates and stale turns are refused.
- **Reconnection.** Each browser holds a random session token; the server stores only its SHA-256 hash. Refreshing returns to the same seat. Rooms are saved to disk after each action and survive a restart.
- **Replay.** A game can be rebuilt from its seed and action log (`replay()` in `src/engine/game.ts`).

### Why not Supabase

The spec allows Supabase "or equivalent". A single Node WebSocket server was used because it needs no account, works offline and on a LAN, and keeps all rules on the server. `RoomStore` in `src/server/store.ts` is the place to add a database. One server process owns its rooms, so do not run several instances behind a load balancer without changing that.

## Deployment

### ขึ้นเว็บฟรีด้วย Render (แนะนำ)

`render.yaml` ตั้งค่าไว้ครบแล้ว

1. สร้าง repository ใหม่ที่ <https://github.com/new> แล้วอัปโหลด **ทุกอย่างข้างใน** โฟลเดอร์ `_upload` (กด *uploading an existing file* แล้วลากไฟล์และโฟลเดอร์ทั้งหมดลงไป → *Commit changes*)
2. ที่ <https://dashboard.render.com> เลือก **New + → Blueprint** → เลือก repository → **Apply / Deploy Blueprint**
3. รอ build 2–4 นาที จะได้ลิงก์แบบ `https://loomline-xxxx.onrender.com` เปิดได้ทั้งคอมและมือถือ
4. กด **สร้างห้อง** แล้วส่งลิงก์ รหัส หรือ QR ให้เพื่อน

ข้อจำกัดของแผนฟรี (ตรวจจาก [เอกสาร Render](https://render.com/docs/free) พฤศจิกายน 2026): เซิร์ฟเวอร์หลับเมื่อไม่มีคนใช้ 15 นาที เปิดครั้งถัดไปรอราว 1 นาที, ได้ 750 ชั่วโมงต่อเดือน และไฟล์หายเมื่อหลับ รีสตาร์ต หรือ deploy ใหม่ ห้องที่ค้างอยู่จึงหายไปด้วย ระหว่างมีคนอยู่ในห้อง แอปส่งสัญญาณทุก 4 นาทีไม่ให้หลับ

### Any other host

The game needs one long-running Node process with WebSocket support and, ideally, a persistent disk. Static or serverless-only hosts are not enough. Free tiers change often; check the current terms, and expect some to sleep when idle (open rooms then reconnect on wake, provided `DATA_DIR` is persistent).

1. Build: `npm ci && npm run build`
2. Start: `node dist/server.mjs`
3. Set `PORT` if the host assigns one, `TRUST_PROXY=1` behind the host's proxy, and `DATA_DIR` to the persistent disk.
4. If the proxy rewrites `Host`, set `ALLOWED_ORIGINS=https://your-domain`.
5. Health check: `GET /healthz`.
6. Serve over HTTPS; the client switches to `wss://` by itself.

A `Dockerfile` is included (not tested here: Docker is unavailable on this machine). **Internet play has not been deployed or tested**; it has been tested on localhost only, in two separate tabs with separate identities.

## Data and privacy

Stored on the server per room: display names, avatar numbers, hashed session tokens, game state and the last 10 results. No e-mail, password or IP address is stored; IPs are only held in memory for rate limiting. A room is deleted when everyone leaves or when it idles past `ROOM_TTL_HOURS`. To erase everything, stop the server and delete `data/`. Each player can clear their own device under Settings → Privacy.

## More

- Rules: [docs/GAME_RULES.md](docs/GAME_RULES.md)
- City pack format: [docs/CITY_PACKS.md](docs/CITY_PACKS.md)
- Status and next steps: [NEXT_STATION_PROGRESS.md](NEXT_STATION_PROGRESS.md)
