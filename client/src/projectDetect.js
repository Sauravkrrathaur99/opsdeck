export function detectProject(items) {
  const names = new Set(items.map((i) => i.name));
  const has = (n) => names.has(n);
  const shortcuts = [];
  let type = 'generic';
  let label = 'Folder';

  // Use venv python directly — works in SSH (no interactive activate needed)
  const py = has('venv') ? './venv/bin/python3' : 'python3';
  const pip = has('venv') ? './venv/bin/pip' : 'pip3';

  const managePyHere = has('manage.py');
  const djangoSub =
    items.find((i) => i.type === 'directory' && /managementsystem|backend|project$/i.test(i.name)) ||
    items.find((i) => i.type === 'directory' && /^manage/i.test(i.name)) ||
    null;

  const manage = managePyHere
    ? 'manage.py'
    : djangoSub
      ? `${djangoSub.name}/manage.py`
      : null;

  if (manage) {
    type = 'django';
    label = djangoSub && !managePyHere ? `Django · ${djangoSub.name}` : 'Django Project';
    shortcuts.push(
      {
        id: 'venv',
        label: 'Check venv',
        command: has('venv') ? './venv/bin/python3 --version && ./venv/bin/pip --version' : 'python3 --version',
        color: 'emerald',
      },
      { id: 'check', label: 'Django Check', command: `${py} ${manage} check` },
      { id: 'migrate', label: 'Migrate', command: `${py} ${manage} migrate` },
      { id: 'server', label: 'Run Server', command: `${py} ${manage} runserver 0.0.0.0:8000`, longRunning: true },
      {
        id: 'gunicorn',
        label: 'Gunicorn :8001',
        command: 'nohup gunicorn --workers 4 --bind 0.0.0.0:8001 --access-logfile gunicorn-access.log hrmanagementsystem.wsgi:application >> gunicorn.log 2>&1 &',
        longRunning: true,
      },
      { id: 'static', label: 'Collect Static', command: `${py} ${manage} collectstatic --noinput` },
      { id: 'pip', label: 'pip install', command: `${pip} install -r requirements.txt` },
      { id: 'log-nginx', label: 'HTTP Logs', command: 'tail -n 100 /var/log/nginx/access.log', color: 'emerald' },
      { id: 'log-gunicorn', label: 'gunicorn.log', command: '{ tail -n 100 gunicorn.log 2>/dev/null || sudo -n tail -n 100 gunicorn.log; }', color: 'emerald' },
      { id: 'log-gunicorn-acc', label: 'gunicorn-access', command: '{ tail -n 100 gunicorn-access.log 2>/dev/null || sudo -n tail -n 100 gunicorn-access.log 2>/dev/null || ls -la gunicorn*.log 2>&1; }', color: 'emerald' },
    );
  }

  if (has('package.json')) {
    type = type === 'django' ? 'django+node' : 'node';
    label = type === 'django+node' ? 'Django + Node' : 'Node.js Project';
    shortcuts.push(
      { id: 'npm-i', label: 'npm install', command: 'npm install' },
      { id: 'npm-dev', label: 'npm run dev', command: 'npm run dev', longRunning: true },
      { id: 'npm-build', label: 'npm run build', command: 'npm run build' },
      { id: 'pm2', label: 'PM2 Status', command: 'pm2 status' },
    );
  }

  if (has('docker-compose.yml') || has('docker-compose.yaml')) {
    shortcuts.push(
      { id: 'dc-up', label: 'Docker Up', command: 'docker compose up -d' },
      { id: 'dc-logs', label: 'Docker Logs', command: 'docker compose logs --tail 80' },
      { id: 'dc-ps', label: 'Docker PS', command: 'docker compose ps' },
    );
    if (type === 'generic') { type = 'docker'; label = 'Docker Project'; }
  }

  if (has('requirements.txt') && !manage) {
    shortcuts.push({ id: 'pip-req', label: 'pip install', command: `${pip} install -r requirements.txt` });
    if (type === 'generic') { type = 'python'; label = 'Python Project'; }
  }

  if (has('ecosystem.config.js') || has('ecosystem.config.cjs')) {
    shortcuts.push(
      { id: 'pm2-start', label: 'PM2 Start', command: 'pm2 start ecosystem.config.js' },
      { id: 'pm2-restart', label: 'PM2 Restart', command: 'pm2 restart all' },
      { id: 'pm2-logs', label: 'PM2 Logs', command: 'pm2 logs --lines 50 --nostream' },
    );
  }

  if (has('Makefile')) {
    shortcuts.push({ id: 'make', label: 'make', command: 'make' });
  }

  if (shortcuts.length === 0) {
    shortcuts.push(
      { id: 'ls', label: 'List All', command: 'ls -la' },
      { id: 'pwd', label: 'Print Path', command: 'pwd' },
      { id: 'disk', label: 'Disk Usage', command: 'du -sh * 2>/dev/null | head -20' },
    );
  }

  return { type, label, shortcuts };
}
