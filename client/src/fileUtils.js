const SECRET_PATTERN = /\.(env|enc|pem|key|crt|p12|pfx|secret|credentials|passwd|token)$/i;
const SECRET_NAMES = /^\.env(\.|$)|^\.htpasswd$|^id_rsa$|^id_ed25519$|\.pem$|secrets?\./i;

export function isSecretFile(name) {
  if (!name) return false;
  if (name.startsWith('.env')) return true;
  return SECRET_PATTERN.test(name) || SECRET_NAMES.test(name);
}

export function deriveProjectRoot(filePath, browsePath) {
  const fileDir = filePath?.replace(/\/[^/]+$/, '') || '';
  const candidates = [browsePath, fileDir].filter(Boolean);
  const deepest = candidates.sort((a, b) => b.length - a.length)[0] || fileDir;
  const parts = deepest.split('/').filter(Boolean);
  if (parts.length <= 4) return deepest || '/';
  return `/${parts.slice(0, Math.max(4, parts.length - 2)).join('/')}`;
}

export function languageForFile(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss',
    md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml',
    xml: 'xml', ini: 'ini', toml: 'ini', env: 'ini', conf: 'ini', cfg: 'ini',
    vue: 'html', php: 'php', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    dockerfile: 'dockerfile', makefile: 'makefile',
  };
  if (name === 'Dockerfile') return 'dockerfile';
  if (name.startsWith('.env')) return 'ini';
  return map[ext] || 'plaintext';
}
