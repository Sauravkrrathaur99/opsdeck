import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import { encrypt, decrypt } from './crypto.js';
import {
  createSSHConnection, execCommand, listDirectory, listDirectoriesFast,
  readRemoteFile, writeRemoteFile, searchProjectFiles, findGitRepo, enrichGitRepo,
} from './ssh.js';
import { withSSH, warmup } from './connectionPool.js';
import { getCache, setCache, invalidateCache } from './cache.js';
import { mergePorts } from './processParser.js';
import { parseLogFiles, parseBackgroundProcesses, parseNginxLogs, buildRunningList } from './folderActivity.js';
import { buildTailCommand, buildAppAccessLogCommand, isAccessLogPath, NGINX_DISCOVER_SCRIPT } from './logTail.js';
import {
  createAuthMiddleware, createSession, verifySession, loginWithToken,
  recordLoginFailure, recordLoginSuccess, checkLoginRate,
  destroySession, extractBearer,
} from './auth.js';
import { validateRemotePath, validateConnectionId, clientIp } from './security.js';

export function createRoutes(masterKey, authConfig = { token: null, required: false }) {
  const router = Router();

  router.get('/auth/status', (req, res) => {
    const session = extractBearer(req);
    const authenticated = !authConfig.token || verifySession(session, authConfig.token);
    res.json({ secured: !!authConfig.token, authenticated });
  });

  router.post('/auth/login', (req, res) => {
    if (!authConfig.token) {
      return res.json({ ok: true, session: null, secured: false });
    }
    const ip = clientIp(req);
    const rate = checkLoginRate(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `Too many login attempts. Try again in ${Math.ceil(rate.retryAfterMs / 60000)} minutes.`,
      });
    }
    const { accessToken } = req.body;
    if (!loginWithToken(accessToken, authConfig.token)) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: 'Invalid access token' });
    }
    recordLoginSuccess(ip);
    res.json({ ok: true, session: createSession(authConfig.token), secured: true });
  });

  router.post('/auth/logout', (req, res) => {
    destroySession(extractBearer(req));
    res.json({ ok: true });
  });

  router.use((req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    return createAuthMiddleware(authConfig.token)(req, res, next);
  });

  async function pooled(connectionId, fn) {
    const id = validateConnectionId(connectionId);
    const connRow = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
    if (!connRow) throw new Error('Connection not found');
    return withSSH(id, connRow, masterKey, fn);
  }

  function sanitizeConnection(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      auth_type: row.auth_type,
      private_key_path: row.private_key_path || '',
      has_password: !!row.password,
      has_key: !!(row.private_key || row.private_key_path),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // Connections
  router.get('/connections', (_req, res) => {
    const rows = db.prepare('SELECT * FROM connections ORDER BY name').all();
    res.json(rows.map(sanitizeConnection));
  });

  router.post('/connections', (req, res) => {
    const { name, host, port, username, auth_type, password, private_key, private_key_path } = req.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO connections (id, name, host, port, username, auth_type, password, private_key, private_key_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      host,
      port || 22,
      username,
      auth_type || 'password',
      password ? encrypt(password, masterKey) : null,
      private_key ? encrypt(private_key, masterKey) : null,
      private_key_path || null
    );

    const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
    res.status(201).json(sanitizeConnection(row));
  });

  router.put('/connections/:id', (req, res) => {
    const { name, host, port, username, auth_type, password, private_key, private_key_path } = req.body;
    const existing = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Connection not found' });

    db.prepare(`
      UPDATE connections
      SET name = ?, host = ?, port = ?, username = ?, auth_type = ?,
          password = ?, private_key = ?, private_key_path = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      host,
      port || 22,
      username,
      auth_type || 'password',
      password ? encrypt(password, masterKey) : existing.password,
      private_key ? encrypt(private_key, masterKey) : existing.private_key,
      private_key_path !== undefined ? (private_key_path || null) : existing.private_key_path,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
    res.json(sanitizeConnection(row));
  });

  router.delete('/connections/:id', (req, res) => {
    db.prepare('DELETE FROM connections WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM saved_commands WHERE connection_id = ?').run(req.params.id);
    db.prepare('DELETE FROM folder_bookmarks WHERE connection_id = ?').run(req.params.id);
    db.prepare('DELETE FROM folder_commands WHERE connection_id = ?').run(req.params.id);
    db.prepare('DELETE FROM command_history WHERE connection_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/connections/:id/test', async (req, res) => {
    const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connection not found' });

    try {
      const result = await pooled(req.params.id, (ssh) =>
        execCommand(ssh, 'echo "OpsDeck connected successfully" && pwd && whoami')
      );
      res.json({ ok: true, output: result.stdout.trim() });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post('/connections/:id/warmup', async (req, res) => {
    const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connection not found' });

    try {
      await warmup(req.params.id, row, masterKey);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Saved commands
  router.get('/commands', (req, res) => {
    const { connection_id } = req.query;
    let rows;
    if (connection_id) {
      rows = db.prepare(`
        SELECT * FROM saved_commands
        WHERE connection_id IS NULL OR connection_id = ?
        ORDER BY category, name
      `).all(connection_id);
    } else {
      rows = db.prepare('SELECT * FROM saved_commands ORDER BY category, name').all();
    }
    res.json(rows);
  });

  router.post('/commands', (req, res) => {
    const { name, command, description, category, connection_id } = req.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO saved_commands (id, name, command, description, category, connection_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, command, description || '', category || 'General', connection_id || null);

    const row = db.prepare('SELECT * FROM saved_commands WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  router.put('/commands/:id', (req, res) => {
    const { name, command, description, category, connection_id } = req.body;
    db.prepare(`
      UPDATE saved_commands
      SET name = ?, command = ?, description = ?, category = ?, connection_id = ?
      WHERE id = ?
    `).run(name, command, description || '', category || 'General', connection_id || null, req.params.id);

    const row = db.prepare('SELECT * FROM saved_commands WHERE id = ?').get(req.params.id);
    res.json(row);
  });

  router.delete('/commands/:id', (req, res) => {
    db.prepare('DELETE FROM saved_commands WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/commands/:id/run', async (req, res) => {
    const cmd = db.prepare('SELECT * FROM saved_commands WHERE id = ?').get(req.params.id);
    if (!cmd) return res.status(404).json({ error: 'Command not found' });

    const connectionId = req.body.connection_id || cmd.connection_id;
    if (!connectionId) return res.status(400).json({ error: 'No connection specified' });

    const connRow = db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId);
    if (!connRow) return res.status(404).json({ error: 'Connection not found' });

    try {
      const ssh = await createSSHConnection(connRow, masterKey);
      const result = await execCommand(ssh, cmd.command);
      ssh.end();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Folder bookmarks
  router.get('/bookmarks', (req, res) => {
    const { connection_id } = req.query;
    const rows = db.prepare(`
      SELECT * FROM folder_bookmarks
      WHERE connection_id = ?
      ORDER BY name
    `).all(connection_id);
    res.json(rows);
  });

  router.post('/bookmarks', (req, res) => {
    const { name, path, connection_id } = req.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO folder_bookmarks (id, name, path, connection_id)
      VALUES (?, ?, ?, ?)
    `).run(id, name, path, connection_id);

    const row = db.prepare('SELECT * FROM folder_bookmarks WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  router.delete('/bookmarks/:id', (req, res) => {
    db.prepare('DELETE FROM folder_bookmarks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Folder-specific commands
  router.get('/folder-commands', (req, res) => {
    const { connection_id, folder_path } = req.query;
    if (!connection_id || !folder_path) {
      return res.status(400).json({ error: 'connection_id and folder_path required' });
    }
    const rows = db.prepare(`
      SELECT * FROM folder_commands
      WHERE connection_id = ? AND folder_path = ?
      ORDER BY name
    `).all(connection_id, folder_path);
    res.json(rows);
  });

  router.post('/folder-commands', (req, res) => {
    const { name, command, folder_path, connection_id, description } = req.body;
    const id = uuid();
    db.prepare(`
      INSERT INTO folder_commands (id, name, command, folder_path, connection_id, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, command, folder_path, connection_id, description || '');
    const row = db.prepare('SELECT * FROM folder_commands WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  router.put('/folder-commands/:id', (req, res) => {
    const { name, command, description } = req.body;
    db.prepare(`
      UPDATE folder_commands SET name = ?, command = ?, description = ? WHERE id = ?
    `).run(name, command, description || '', req.params.id);
    const row = db.prepare('SELECT * FROM folder_commands WHERE id = ?').get(req.params.id);
    res.json(row);
  });

  router.delete('/folder-commands/:id', (req, res) => {
    db.prepare('DELETE FROM folder_commands WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  function trimOutput(text, max = 50000) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) + '\n...(truncated)' : text;
  }

  function saveHistory({ connection_id, folder_path, command, label, stdout, stderr, exit_code }) {
    const id = uuid();
    db.prepare(`
      INSERT INTO command_history (id, connection_id, folder_path, command, label, stdout, stderr, exit_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, connection_id, folder_path, command, label || command,
      trimOutput(stdout), trimOutput(stderr), exit_code ?? 0
    );
    return id;
  }

  router.get('/command-history', (req, res) => {
    const { connection_id, folder_path, limit = 50 } = req.query;
    if (!connection_id || !folder_path) {
      return res.status(400).json({ error: 'connection_id and folder_path required' });
    }
    const rows = db.prepare(`
      SELECT id, command, label, stdout, stderr, exit_code, created_at
      FROM command_history
      WHERE connection_id = ? AND folder_path = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(connection_id, folder_path, parseInt(limit, 10) || 50);
    res.json(rows);
  });

  router.post('/command-history', (req, res) => {
    const { connection_id, folder_path, command, label, stdout, stderr, exit_code } = req.body;
    if (!connection_id || !folder_path || !command) {
      return res.status(400).json({ error: 'connection_id, folder_path, and command required' });
    }
    const id = saveHistory({ connection_id, folder_path, command, label, stdout, stderr, exit_code });
    res.status(201).json({ id });
  });

  router.delete('/command-history/:id', (req, res) => {
    db.prepare('DELETE FROM command_history WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  function withLogSudoFallback(command) {
    const trimmed = command.trim();
    if (!/^tail\b/i.test(trimmed) && !/^\{/.test(trimmed)) return command;
    if (!/\/var\/log\//.test(trimmed) && !/\bgunicorn.*\.log\b/i.test(trimmed)) return command;
    return `{ ${trimmed.replace(/^\{|\};?$/g, '').trim()} 2>/dev/null || sudo -n ${trimmed.replace(/^\{|\};?$/g, '').trim()}; }`;
  }

  function resolveLogCommand(command) {
    const trimmed = command.trim();
    const pathMatch = trimmed.match(/(\/var\/log\/nginx\/[^\s;'"{}]+|gunicorn-access\.log)/);
    if (pathMatch && isAccessLogPath(pathMatch[1])) {
      const linesMatch = trimmed.match(/-n\s+(\d+)/);
      return buildAppAccessLogCommand(pathMatch[1], linesMatch?.[1] || 100);
    }
    return withLogSudoFallback(trimmed);
  }

  router.post('/folder-commands/run', async (req, res) => {
    const { connection_id, folder_path, command, label } = req.body;
    if (!connection_id || !folder_path || !command) {
      return res.status(400).json({ error: 'connection_id, folder_path, and command required' });
    }

    const safeFolder = validateRemotePath(folder_path);
    const resolved = resolveLogCommand(command);
    const full = `cd ${JSON.stringify(safeFolder)} && ${resolved}`;

    try {
      const result = await pooled(connection_id, (ssh) =>
        Promise.race([
          execCommand(ssh, full),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Command timed out (20s). Long-running? Check Terminal tab.')), 20000)
          ),
        ])
      );
      const historyId = saveHistory({
        connection_id, folder_path, command: resolved, label,
        stdout: result.stdout, stderr: result.stderr, exit_code: result.code,
      });
      res.json({
        ok: result.code === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        command: resolved,
        folder_path,
        historyId,
      });
    } catch (err) {
      const historyId = saveHistory({
        connection_id, folder_path, command, label,
        stdout: '', stderr: err.message, exit_code: 1,
      });
      res.status(400).json({ ok: false, error: err.message, historyId });
    }
  });

  router.get('/folder-activity', async (req, res) => {
    const { connection_id, folder_path } = req.query;
    if (!connection_id || !folder_path) {
      return res.status(400).json({ error: 'connection_id and folder_path required' });
    }
    try {
      const pathJson = JSON.stringify(folder_path);
      const normalizedPath = folder_path.replace(/\/$/, '');
      const procScript = [
        `FOLDER=${JSON.stringify(normalizedPath)}`,
        'for pid in $(pgrep -f "gunicorn|uvicorn|manage.py runserver|daphne|node" 2>/dev/null); do',
        '  cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || echo "")',
        '  cmd=$(tr "\\0" " " < /proc/$pid/cmdline 2>/dev/null | head -c 220)',
        '  match=0',
        '  case "$cwd" in "$FOLDER"|"$FOLDER"/*) match=1 ;; esac',
        '  echo "$cmd" | grep -qF "$FOLDER" && match=1',
        '  if [ "$match" = 1 ]; then echo "$pid $cmd"; fi',
        'done',
      ].join('\n');

      const pm2Res = await pooled(connection_id, (ssh) => execCommand(ssh, 'pm2 jlist 2>/dev/null || echo "[]"'));
      const pgrepRes = await pooled(connection_id, (ssh) => execCommand(ssh, procScript));
      const logsRes = await pooled(connection_id, (ssh) =>
        execCommand(ssh, `find ${pathJson} -maxdepth 3 \\( -name "*.log" -o -name "nohup.out" \\) -type f 2>/dev/null | head -30`)
      );
      const nginxRes = await pooled(connection_id, (ssh) => execCommand(ssh, NGINX_DISCOVER_SCRIPT));

      let pm2Raw = [];
      try {
        pm2Raw = JSON.parse(pm2Res.stdout.trim() || '[]');
      } catch {
        pm2Raw = [];
      }

      const pm2Apps = pm2Raw
        .filter((p) => {
          const cwd = (p.pm2_env?.pm_cwd || '').replace(/\/$/, '');
          return cwd === normalizedPath || cwd.startsWith(normalizedPath + '/');
        })
        .map((p) => ({
          type: 'pm2',
          id: `pm2-${p.pm_id}`,
          name: p.name,
          status: p.pm2_env?.status || 'unknown',
          port: p.pm2_env?.env?.PORT || p.pm2_env?.PORT || null,
          cpu: p.monit?.cpu ?? 0,
          memory: p.monit?.memory ?? 0,
          logType: 'pm2',
          logTarget: p.name,
        }));

      const logFiles = parseLogFiles(logsRes.stdout, folder_path);
      const processes = parseBackgroundProcesses(pgrepRes.stdout, folder_path, logFiles);
      const nginxLogs = parseNginxLogs(nginxRes.stdout);

      const running = buildRunningList(pm2Apps, processes, logFiles, nginxLogs);

      res.json({ running, logFiles, folder_path, fetchedAt: new Date().toISOString() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Running processes & ports
  router.get('/processes', async (req, res) => {
    const { connection_id } = req.query;
    if (!connection_id) return res.status(400).json({ error: 'connection_id required' });

    const connRow = db.prepare('SELECT * FROM connections WHERE id = ?').get(connection_id);
    if (!connRow) return res.status(404).json({ error: 'Connection not found' });

    const cacheKey = `processes:${connection_id}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const [pm2Res, dockerRes, portsRes, lsofRes] = await pooled(connection_id, async (ssh) =>
        Promise.all([
          execCommand(ssh, 'pm2 jlist 2>/dev/null || echo "[]"'),
          execCommand(ssh, 'docker ps --format "{{.ID}}|{{.Names}}|{{.Ports}}|{{.Status}}" 2>/dev/null || true'),
          execCommand(ssh, 'ss -tlnpH 2>/dev/null || ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true'),
          execCommand(ssh, 'lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true'),
        ])
      );

      let pm2Raw = [];
      try {
        pm2Raw = JSON.parse(pm2Res.stdout.trim() || '[]');
      } catch {
        pm2Raw = [];
      }

      const pm2 = pm2Raw.map((p) => ({
        type: 'pm2',
        id: String(p.pm_id),
        name: p.name,
        status: p.pm2_env?.status || 'unknown',
        port: p.pm2_env?.env?.PORT || p.pm2_env?.PORT || null,
        cpu: p.monit?.cpu ?? 0,
        memory: p.monit?.memory ?? 0,
        cwd: p.pm2_env?.pm_cwd || '',
        logPath: p.pm2_env?.pm_out_log_path || '',
      }));

      const docker = dockerRes.stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [id, name, ports, status] = line.split('|');
        const portMatch = ports?.match(/:(\d+)->/);
        return { type: 'docker', id, name, ports: ports || '', port: portMatch?.[1] || null, status };
      });

      const ports = mergePorts(portsRes.stdout, lsofRes.stdout, pm2, docker);

      const result = { pm2, docker, ports, fetchedAt: new Date().toISOString() };
      setCache(cacheKey, result, 45000);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/processes/logs', async (req, res) => {
    const { connection_id, type, target, lines = 150, filter } = req.body;
    if (!connection_id || !type || !target) {
      return res.status(400).json({ error: 'connection_id, type, and target required' });
    }

    const connRow = db.prepare('SELECT * FROM connections WHERE id = ?').get(connection_id);
    if (!connRow) return res.status(404).json({ error: 'Connection not found' });

    let cmd;
    if (type === 'pm2') cmd = `pm2 logs "${target}" --lines ${lines} --nostream 2>&1`;
    else if (type === 'docker') cmd = `docker logs "${target}" --tail ${lines} 2>&1`;
    else if (type === 'file') {
      const useAppFilter = filter === 'app' || isAccessLogPath(target);
      cmd = useAppFilter ? buildAppAccessLogCommand(target, lines) : buildTailCommand(target, lines);
    }
    else return res.status(400).json({ error: 'Invalid log type' });

    try {
      const result = await pooled(connection_id, (ssh) => execCommand(ssh, cmd));
      res.json({ ok: true, logs: result.stdout + result.stderr, target, type });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/files/read', async (req, res) => {
    const { connection_id, path: remotePath } = req.query;
    if (!connection_id || !remotePath) {
      return res.status(400).json({ error: 'connection_id and path required' });
    }
    try {
      const safePath = validateRemotePath(remotePath);
      const data = await pooled(connection_id, (ssh) => readRemoteFile(ssh, safePath));
      res.json({ path: safePath, ...data });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/files/write', async (req, res) => {
    const { connection_id, path: remotePath, content } = req.body;
    if (!connection_id || !remotePath || content === undefined) {
      return res.status(400).json({ error: 'connection_id, path, and content required' });
    }
    try {
      const safePath = validateRemotePath(remotePath);
      const result = await pooled(connection_id, (ssh) => writeRemoteFile(ssh, safePath, content));
      const parent = safePath.replace(/\/[^/]+$/, '') || '/';
      invalidateCache(`files:${connection_id}:${parent}`);
      invalidateCache(`files:${connection_id}:${safePath}`);
      res.json({ ok: true, path: safePath, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/files/search', async (req, res) => {
    const { connection_id, root, q, limit } = req.query;
    if (!connection_id || !root || !q) {
      return res.status(400).json({ error: 'connection_id, root, and q required' });
    }
    try {
      const safeRoot = validateRemotePath(root);
      const items = await pooled(connection_id, (ssh) =>
        searchProjectFiles(ssh, safeRoot, q, limit)
      );
      res.json({ root: safeRoot, q, items });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/files/git-info', async (req, res) => {
    const { connection_id, path: remotePath } = req.query;
    if (!connection_id || !remotePath) {
      return res.status(400).json({ error: 'connection_id and path required' });
    }

    const cacheKey = `git-info:${connection_id}:${remotePath}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const safePath = validateRemotePath(remotePath);
      const fastPath = req.query.has_dot_git === '1';
      const info = await pooled(connection_id, (ssh) =>
        fastPath ? enrichGitRepo(ssh, safePath) : findGitRepo(ssh, safePath)
      );
      const result = { path: safePath, ...info };
      if (info.isRepo) {
        setCache(cacheKey, result, 15000);
      }
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // File browser
  router.get('/files', async (req, res) => {
    const { connection_id, path: remotePath, dirs_only } = req.query;
    if (!connection_id || !remotePath) {
      return res.status(400).json({ error: 'connection_id and path required' });
    }

    const cacheKey = `files:${connection_id}:${remotePath}:${dirs_only || 'full'}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const safePath = validateRemotePath(remotePath);
      const items = await pooled(connection_id, async (ssh) =>
        dirs_only === '1' ? listDirectoriesFast(ssh, safePath) : listDirectory(ssh, safePath)
      );
      const result = { path: safePath, items };
      setCache(cacheKey, result, dirs_only === '1' ? 300000 : 120000);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
