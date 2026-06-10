import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { getDataDir } from './paths.js';

const dataDir = getDataDir();

mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'opsdeck.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'password',
    password TEXT,
    private_key TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS saved_commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    connection_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS folder_bookmarks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

try {
  db.exec('ALTER TABLE connections ADD COLUMN private_key_path TEXT');
} catch {
  // column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS folder_commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS command_history (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    command TEXT NOT NULL,
    label TEXT,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
