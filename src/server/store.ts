import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomData } from './rooms';

/** Persistence boundary. Swap this for a database adapter to run several servers. */
export interface RoomStore {
  loadAll(): RoomData[];
  save(room: RoomData): void;
  remove(code: string): void;
}

export class MemoryStore implements RoomStore {
  readonly rooms = new Map<string, string>();
  loadAll() {
    return [...this.rooms.values()].map((s) => JSON.parse(s) as RoomData);
  }
  save(room: RoomData) {
    this.rooms.set(room.code, JSON.stringify(room));
  }
  remove(code: string) {
    this.rooms.delete(code);
  }
}

/** One JSON file per room, replaced atomically. */
export class FileStore implements RoomStore {
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = join(dir, 'rooms');
    mkdirSync(this.dir, { recursive: true });
  }
  private path(code: string) {
    if (!/^[A-Z0-9]+$/.test(code)) throw new Error('bad room code');
    return join(this.dir, `${code}.json`);
  }
  loadAll(): RoomData[] {
    const out: RoomData[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as RoomData);
      } catch (e) {
        console.error(`skipping unreadable room file ${f}:`, (e as Error).message);
      }
    }
    return out;
  }
  save(room: RoomData) {
    const file = this.path(room.code);
    writeFileSync(`${file}.tmp`, JSON.stringify(room));
    renameSync(`${file}.tmp`, file);
  }
  remove(code: string) {
    rmSync(this.path(code), { force: true });
  }
}
