import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { getConnection } from './connectionPool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GIT_BASH_INIT = readFileSync(join(__dirname, 'gitBashInit.sh'), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const WS_PING_INTERVAL = 25000;
const PERMANENT_SSH_ERRORS = /could not be decrypted|no ssh key provided|connection not found|unauthorized|authentication methods failed|authentication failed|access denied/i;

function send(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function shellQuote(path) {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function buildShellCommand(cwd, mode) {
  const cd = `cd ${shellQuote(cwd)}`;
  if (mode === 'git') {
    const b64 = Buffer.from(GIT_BASH_INIT).toString('base64');
    const writeInit = `(printf '%s' ${shellQuote(b64)} | base64 -d 2>/dev/null || printf '%s' ${shellQuote(b64)} | base64 --decode 2>/dev/null)`;
    const primary = `${cd} && f="/tmp/opsdeck-gb-$$.sh" && ${writeInit} > "$f" && exec bash --noprofile --norc -i "$f"`;
    const fallback = `${cd} && exec bash --noprofile --norc -i`;
    return `${primary} || ${fallback}`;
  }
  return `${cd} && exec bash -i`;
}

function openInteractiveShell(sshConn, { cwd, cols, rows, mode }, callback) {
  const term = 'xterm-256color';
  const pty = { rows, cols, term };

  if (cwd) {
    const cmd = buildShellCommand(cwd, mode);
    sshConn.exec(cmd, { pty, env: { TERM: term } }, callback);
  } else {
    sshConn.shell({ term, cols, rows }, callback);
  }
}

export function attachTerminalSocket(ws, req, masterKey) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const connectionId = url.searchParams.get('connection_id');
  const cwd = url.searchParams.get('cwd')?.trim() || null;
  const mode = url.searchParams.get('mode')?.trim() || null;

  if (!connectionId) {
    send(ws, 'error', 'Missing connection_id');
    ws.close();
    return;
  }

  const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId);
  if (!row) {
    send(ws, 'error', 'Connection not found');
    ws.close();
    return;
  }

  let sshConn = null;
  let shellStream = null;
  let alive = true;
  let shellOpening = false;
  let shellAttachAttempts = 0;
  let shellCols = 120;
  let shellRows = 30;

  const cleanup = () => {
    alive = false;
    clearInterval(pingTimer);
    if (shellStream) {
      shellStream.removeAllListeners();
      shellStream.end();
      shellStream = null;
    }
  };

  const attachShell = (isReconnect = false) => {
    if (!alive || shellOpening || !sshConn || ws.readyState !== ws.OPEN) return;
    shellOpening = true;

    openInteractiveShell(sshConn, { cwd, cols: shellCols, rows: shellRows, mode }, (err, stream) => {
      shellOpening = false;
      if (err) {
        if (alive && ws.readyState === ws.OPEN) {
          send(ws, 'error', `Shell error: ${err.message}`);
          if (PERMANENT_SSH_ERRORS.test(err.message)) {
            alive = false;
          }
        }
        return;
      }

      if (shellStream) {
        shellStream.removeAllListeners();
        shellStream.end();
      }

      shellStream = stream;
      shellAttachAttempts = 0;

      stream.on('data', (data) => send(ws, 'output', data.toString()));
      stream.stderr.on('data', (data) => send(ws, 'output', data.toString()));
      stream.on('close', () => {
        shellStream = null;
        if (alive && ws.readyState === ws.OPEN && !shellOpening && shellAttachAttempts < 2) {
          shellAttachAttempts += 1;
          setTimeout(() => attachShell(true), 400);
        }
      });

      if (isReconnect) {
        send(ws, 'reconnected', `Reconnected to ${row.name} (${row.host})`);
      } else {
        const where = cwd ? ` · ${cwd}` : '';
        send(ws, 'connected', `${row.name} (${row.host})${where}`);
      }
    });
  };

  const connectSSH = async (isReconnect = false) => {
    if (!alive) return;

    try {
      if (!sshConn) {
        sshConn = await getConnection(connectionId, row, masterKey);
        const resetConn = () => { sshConn = null; };
        sshConn.once('close', resetConn);
        sshConn.once('error', resetConn);
      }
      attachShell(isReconnect);
    } catch (err) {
      sshConn = null;
      if (alive && ws.readyState === ws.OPEN) {
        send(ws, 'error', err.message);
        if (!PERMANENT_SSH_ERRORS.test(err.message)) {
          setTimeout(() => connectSSH(true), 800);
        } else {
          alive = false;
        }
      }
    }
  };

  connectSSH(false);

  const pingTimer = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, WS_PING_INTERVAL);

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'ping') {
        send(ws, 'pong', Date.now());
        return;
      }
      if (msg.type === 'input' && shellStream) {
        shellStream.write(msg.data);
      } else if (msg.type === 'resize' && shellStream) {
        shellCols = msg.cols || shellCols;
        shellRows = msg.rows || shellRows;
        shellStream.setWindow(shellRows, shellCols);
      }
    } catch {
      if (shellStream) shellStream.write(message.toString());
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
}
