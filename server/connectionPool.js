import { createSSHConnection } from './ssh.js';

const pool = new Map();
const pending = new Map();
const IDLE_TIMEOUT = 30 * 60 * 1000;

export async function getConnection(connectionId, config, masterKey) {
  const entry = pool.get(connectionId);
  if (entry?.conn) {
    entry.lastUsed = Date.now();
    return entry.conn;
  }

  if (pending.has(connectionId)) {
    return pending.get(connectionId);
  }

  const connectPromise = createSSHConnection(config, masterKey)
    .then((conn) => {
      const item = { conn, lastUsed: Date.now() };
      pool.set(connectionId, item);
      pending.delete(connectionId);

      const cleanup = () => {
        pool.delete(connectionId);
        pending.delete(connectionId);
      };
      conn.on('close', cleanup);
      conn.on('error', cleanup);

      return conn;
    })
    .catch((err) => {
      pending.delete(connectionId);
      throw err;
    });

  pending.set(connectionId, connectPromise);
  return connectPromise;
}

export async function withSSH(connectionId, config, masterKey, fn) {
  const conn = await getConnection(connectionId, config, masterKey);
  try {
    return await fn(conn);
  } catch (err) {
    const entry = pool.get(connectionId);
    if (entry) {
      entry.conn.end();
      pool.delete(connectionId);
    }
    throw err;
  }
}

export async function warmup(connectionId, config, masterKey) {
  const { execCommand } = await import('./ssh.js');
  return withSSH(connectionId, config, masterKey, (conn) => execCommand(conn, 'true'));
}

export function closePool(connectionId) {
  const entry = pool.get(connectionId);
  if (entry) {
    entry.conn.end();
    pool.delete(connectionId);
  }
  pending.delete(connectionId);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pool) {
    if (now - entry.lastUsed > IDLE_TIMEOUT) {
      entry.conn.end();
      pool.delete(id);
    }
  }
}, 60000);
