import { Client } from 'ssh2';
import { decrypt } from './crypto.js';
import { normalizePrivateKey, readPrivateKeyFromPath } from './keyUtils.js';

function resolvePrivateKey(config, masterKey) {
  if (config.auth_type !== 'key') return null;

  if (config.private_key_path) {
    return readPrivateKeyFromPath(config.private_key_path);
  }

  if (!config.private_key) {
    throw new Error('No SSH key provided. Set a key file path or paste the private key.');
  }

  const decrypted = decrypt(config.private_key, masterKey);
  const candidate = decrypted || config.private_key;
  const normalized = normalizePrivateKey(candidate);

  if (!normalized) {
    throw new Error('SSH key could not be decrypted. Edit the connection and save the key again.');
  }

  return normalized;
}

export function createSSHConnection(config, masterKey) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const sshConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 12,
    };

    try {
      if (config.auth_type === 'key') {
        sshConfig.privateKey = resolvePrivateKey(config, masterKey);
      } else if (config.password) {
        sshConfig.password = decrypt(config.password, masterKey) || config.password;
      }
    } catch (err) {
      reject(err);
      return;
    }

    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect(sshConfig);
  });
}

export function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      stream.on('data', (data) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

export async function listDirectoriesFast(conn, remotePath) {
  const escaped = remotePath.replace(/'/g, "'\\''");
  const result = await execCommand(
    conn,
    `find '${escaped}' -maxdepth 1 -mindepth 1 -type d -printf '%f\\n' 2>/dev/null`
  );

  const names = result.stdout.trim().split('\n').filter(Boolean);
  return names.map((name) => ({
    name,
    path: remotePath === '/' ? `/${name}` : `${remotePath}/${name}`,
    type: 'directory',
    size: 0,
    modified: null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function sortItems(items) {
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listDirectoryFast(conn, remotePath) {
  const escaped = remotePath.replace(/'/g, "'\\''");
  const result = await execCommand(
    conn,
    `ls -la --time-style=+%s '${escaped}' 2>/dev/null | tail -n +2`
  );

  const items = result.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const match = line.match(/^([dl-][rwx-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) return null;
    const [, perms, size, mtime, name] = match;
    if (name === '.' || name === '..') return null;
    const isDir = perms.startsWith('d');
    return {
      name,
      path: remotePath === '/' ? `/${name}` : `${remotePath}/${name}`,
      type: isDir ? 'directory' : 'file',
      size: parseInt(size, 10) || 0,
      modified: new Date(parseInt(mtime, 10) * 1000).toISOString(),
    };
  }).filter(Boolean);

  return sortItems(items);
}

export function listDirectory(conn, remotePath) {
  return listDirectoryFast(conn, remotePath);
}

const MAX_EDIT_BYTES = 2 * 1024 * 1024;

function withSftp(conn, fn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      Promise.resolve(fn(sftp)).then(resolve, reject);
    });
  });
}

async function filePermissionsHint(conn, remotePath) {
  const result = await execCommand(conn, `ls -la ${JSON.stringify(remotePath)} 2>&1`);
  return result.stdout.trim() || result.stderr.trim();
}

async function readViaSudoCat(conn, remotePath, maxBytes) {
  const cmd = `{ cat ${JSON.stringify(remotePath)} 2>/dev/null || sudo -n cat ${JSON.stringify(remotePath)}; } | head -c ${maxBytes}`;
  const result = await execCommand(conn, cmd);
  if (result.code !== 0 && !result.stdout) {
    const hint = await filePermissionsHint(conn, remotePath);
    throw new Error(`Cannot read file.\n${hint}`);
  }
  return {
    content: result.stdout,
    size: Buffer.byteLength(result.stdout, 'utf8'),
    modified: null,
  };
}

function readViaSftp(conn, remotePath, maxBytes) {
  return withSftp(conn, (sftp) => new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) return reject(new Error(err.message || 'Cannot read file'));
      if (stats.isDirectory()) return reject(new Error('Path is a directory'));
      if (stats.size > maxBytes) {
        return reject(new Error(`File too large to edit (${formatBytes(stats.size)}). Max ${formatBytes(maxBytes)}.`));
      }
      const chunks = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('error', (e) => reject(new Error(e.message || 'Read failed')));
      stream.on('close', () => {
        resolve({
          content: Buffer.concat(chunks).toString('utf8'),
          size: stats.size,
          modified: stats.mtime ? new Date(stats.mtime * 1000).toISOString() : null,
        });
      });
    });
  }));
}

export async function readRemoteFile(conn, remotePath, maxBytes = MAX_EDIT_BYTES) {
  try {
    return await readViaSftp(conn, remotePath, maxBytes);
  } catch (err) {
    if (/permission|denied|EACCES/i.test(err.message)) {
      return readViaSudoCat(conn, remotePath, maxBytes);
    }
    throw err;
  }
}

async function writeViaExec(conn, remotePath, content, useSudo = false) {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const target = JSON.stringify(remotePath);
  const prefix = useSudo ? 'sudo -n ' : '';
  const cmd = `echo ${JSON.stringify(b64)} | base64 -d | ${prefix}tee ${target} > /dev/null`;
  const result = await execCommand(conn, cmd);
  if (result.code !== 0) {
    const hint = await filePermissionsHint(conn, remotePath);
    throw new Error(
      `Permission denied — logged in as deploy but this file is not writable by you.\n` +
      `${hint}\n\n` +
      `Fix in Terminal: sudo chown deploy:deploy ${remotePath}`
    );
  }
  return { ok: true, size: Buffer.byteLength(content, 'utf8'), usedSudo: useSudo };
}

export async function writeRemoteFile(conn, remotePath, content) {
  if (Buffer.byteLength(content, 'utf8') > MAX_EDIT_BYTES) {
    throw new Error(`Content too large. Max ${formatBytes(MAX_EDIT_BYTES)}.`);
  }
  try {
    await withSftp(conn, (sftp) => new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(content, 'utf8');
    }));
    return { ok: true, size: Buffer.byteLength(content, 'utf8') };
  } catch {
    try {
      return await writeViaExec(conn, remotePath, content, false);
    } catch {
      return writeViaExec(conn, remotePath, content, true);
    }
  }
}

export async function searchProjectFiles(conn, root, query, limit = 40) {
  const safe = root.replace(/'/g, "'\\''");
  const pattern = String(query).replace(/[^a-zA-Z0-9._*-]/g, '');
  if (!pattern || pattern.length < 1) return [];

  const max = Math.min(Math.max(parseInt(limit, 10) || 40, 5), 80);
  const cmd = [
    `find '${safe}'`,
    '\\( -path "*/node_modules/*" -o -path "*/.git/*" -o -path "*/venv/*"',
    '-o -path "*/__pycache__/*" -o -path "*/.cache/*" -o -path "*/dist/*" \\) -prune',
    `-o -type f -iname "*${pattern}*" -print 2>/dev/null | head -${max}`,
  ].join(' ');

  const result = await execCommand(conn, cmd);
  return result.stdout.trim().split('\n').filter(Boolean).map((fullPath) => ({
    name: fullPath.split('/').pop(),
    path: fullPath,
    type: 'file',
  }));
}

export async function enrichGitRepo(conn, root) {
  const rootEsc = root.replace(/'/g, "'\\''");
  const result = await execCommand(
    conn,
    `b='${rootEsc}'; git -C "$b" branch --show-current 2>/dev/null; printf '\\n__OPS__\\n'; head -1 "$b/.git/HEAD" 2>/dev/null; printf '\\n__OPS__\\n'; git -C "$b" status -sb 2>/dev/null | head -1; printf '\\n__OPS__\\n'; git -C "$b" status --porcelain 2>/dev/null | wc -l`
  );

  const [branchRaw = '', headRaw = '', statusLine = '', dirtyRaw = '0'] = result.stdout.split('\n__OPS__\n');

  let branch = branchRaw.trim() || null;
  if (!branch || branch === 'HEAD') {
    const headLine = headRaw.trim();
    const refMatch = headLine.match(/^ref: refs\/heads\/(.+)$/);
    if (refMatch) branch = refMatch[1].trim();
    else if (/^[0-9a-f]{7,40}$/i.test(headLine)) branch = headLine.slice(0, 7);
  }
  if (!branch) {
    const headOnly = await execCommand(conn, `head -1 '${rootEsc}/.git/HEAD' 2>/dev/null`);
    const headLine = headOnly.stdout.trim();
    const refMatch = headLine.match(/^ref: refs\/heads\/(.+)$/);
    if (refMatch) branch = refMatch[1].trim();
  }

  const dirtyCount = parseInt(dirtyRaw.trim(), 10) || 0;
  let status = statusLine.trim() || null;
  if (!status && branch) status = `## ${branch}`;

  return {
    isRepo: true,
    root,
    branch,
    statusLine: status,
    dirty: dirtyCount > 0,
    changedFiles: dirtyCount,
    hasDotGit: true,
  };
}

export async function findGitRepo(conn, startPath) {
  let path = (startPath || '/').replace(/\/+$/, '') || '/';

  // Walk up using ls -A (same visibility as file browser, includes hidden .git)
  for (let depth = 0; depth < 24; depth += 1) {
    const escaped = path.replace(/'/g, "'\\''");
    const listing = await execCommand(conn, `ls -A '${escaped}' 2>/dev/null`);
    const entries = listing.stdout.split('\n').map((e) => e.trim()).filter(Boolean);
    if (entries.includes('.git')) {
      return enrichGitRepo(conn, path);
    }

    const parent = path.split('/').slice(0, -1).join('/') || '/';
    if (parent === path) break;
    path = parent;
  }

  const escaped = startPath.replace(/'/g, "'\\''");
  const gitRoot = await execCommand(
    conn,
    `git -C '${escaped}' rev-parse --show-toplevel 2>/dev/null`
  );
  if (gitRoot.stdout.trim()) {
    return enrichGitRepo(conn, gitRoot.stdout.trim());
  }

  const findResult = await execCommand(
    conn,
    `find '${escaped}' -maxdepth 8 -name .git \\( -type d -o -type f \\) -print -quit 2>/dev/null`
  );
  const gitPath = findResult.stdout.trim();
  if (gitPath) {
    return enrichGitRepo(conn, gitPath.replace(/\/\.git\/?$/, ''));
  }

  return {
    isRepo: false,
    root: null,
    branch: null,
    statusLine: null,
    dirty: false,
    changedFiles: 0,
    hasDotGit: false,
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
