import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server';
import { RoomManager } from './rooms';
import { FileStore, MemoryStore } from './store';

const env = process.env;
const port = Number(env.PORT ?? 8787);
const host = env.HOST ?? '0.0.0.0';
const dataDir = env.DATA_DIR ?? './data';
const here = dirname(fileURLToPath(import.meta.url));
// Bundled: dist/server.mjs -> dist/public. From source: src/server -> dist/public.
const staticDir = [join(here, 'public'), join(here, '../../dist/public')].find((d) => existsSync(d));

const manager = new RoomManager({
  store: dataDir === 'memory' ? new MemoryStore() : new FileStore(dataDir),
  ttlMs: Number(env.ROOM_TTL_HOURS ?? 12) * 3600_000,
});
const app = createApp({
  manager,
  staticDir,
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1',
  ipHeader: env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined,
});

app.http.on('error', (e) => {
  console.error(`cannot listen on port ${port}: ${e.message}`);
  process.exit(1);
});
app.http.listen(port, host, () => {
  console.log(`Loomline server: http://localhost:${port}${staticDir ? '' : '  (API only; client not built)'}`);
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  on your network:  http://${i.address}:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
