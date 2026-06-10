export function parseLogFiles(findOutput, folderPath) {
  return findOutput.trim().split('\n').filter(Boolean).map((fullPath) => {
    const name = fullPath.split('/').pop();
    return { name, path: fullPath, folder: folderPath };
  });
}

export function parseBackgroundProcesses(pgrepOutput, folderPath, logFiles) {
  const items = [];
  const seen = new Set();

  for (const line of pgrepOutput.trim().split('\n').filter(Boolean)) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, pid, cmd] = match;
    if (seen.has(pid)) continue;
    seen.add(pid);

    if (!/gunicorn|uvicorn|node|manage\.py|nohup|npm|python.*wsgi/i.test(cmd)) continue;
    if (cmd.includes('grep ') || cmd.includes('pgrep ')) continue;

    let name = `process ${pid}`;
    let port = null;

    if (cmd.includes('gunicorn')) {
      const portMatch = cmd.match(/:(\d{4,5})/);
      port = portMatch?.[1] || null;
      name = port ? `gunicorn :${port}` : 'gunicorn';
    } else if (cmd.includes('uvicorn')) {
      name = 'uvicorn';
      const portMatch = cmd.match(/:(\d{4,5})/);
      port = portMatch?.[1] || null;
    } else if (cmd.includes('manage.py')) {
      name = 'django runserver';
    } else if (cmd.includes('node')) {
      name = 'node';
    }

    const matchedLog =
      logFiles.find((f) => f.name === 'gunicorn-access.log' && cmd.includes('gunicorn')) ||
      logFiles.find((f) => f.name === 'gunicorn.log' && cmd.includes('gunicorn')) ||
      logFiles.find((f) => f.name === 'nohup.out') ||
      logFiles.find((f) => cmd.includes(f.name.replace('.log', '')));

    items.push({
      type: 'process',
      id: `proc-${pid}`,
      name,
      pid,
      status: 'running',
      port,
      command: cmd.length > 100 ? cmd.slice(0, 100) + '…' : cmd,
      logType: matchedLog ? 'file' : null,
      logTarget: matchedLog?.path || null,
    });
  }

  return items;
}

export function parseNginxLogs(lsOutput) {
  return lsOutput.trim().split('\n').filter(Boolean).map((fullPath) => {
    const name = fullPath.split('/').pop();
    const isAccess = /access/i.test(name);
    return {
      name,
      path: fullPath,
      label: isAccess ? `🌐 HTTP · ${name}` : `🌐 nginx ${name}`,
      kind: isAccess ? 'nginx-access' : 'nginx',
    };
  });
}

export function buildRunningList(pm2Apps, processes, logFiles, nginxLogs = []) {
  const running = [...pm2Apps];
  const usedLogs = new Set();

  for (const proc of processes) {
    if (proc.logTarget) usedLogs.add(proc.logTarget);
    running.push(proc);
  }

  for (const log of logFiles) {
    if (usedLogs.has(log.path)) continue;
    const isAccess = /access/i.test(log.name);
    running.push({
      type: 'logfile',
      id: `log-${log.path}`,
      name: isAccess ? `📄 ${log.name} (HTTP)` : `📄 ${log.name}`,
      status: 'log',
      port: null,
      logType: 'file',
      logTarget: log.path,
    });
  }

  for (const log of nginxLogs) {
    if (usedLogs.has(log.path)) continue;
    running.push({
      type: 'nginx',
      id: `nginx-${log.path}`,
      name: log.label,
      status: 'log',
      port: null,
      logType: 'file',
      logTarget: log.path,
      hint: 'GET/POST only · no bots',
    });
  }

  return running;
}
