const SERVER_TYPES = new Set(['pm2', 'process']);

function isActiveServer(item) {
  if (!item || !SERVER_TYPES.has(item.type)) return false;
  if (item.type === 'pm2') {
    const s = (item.status || '').toLowerCase();
    return s === 'online' || s === 'running';
  }
  return item.status === 'running' || !item.status;
}

export function getFolderServerStatus(running = []) {
  const servers = running.filter(isActiveServer);

  if (servers.length === 0) {
    return { running: false, servers: [], label: 'App stopped', detail: null };
  }

  const detail = servers
    .map((s) => (s.port ? `${s.name.replace(/ :\d+$/, '')} :${s.port}` : s.name))
    .join(', ');

  return { running: true, servers, label: 'App running', detail };
}
