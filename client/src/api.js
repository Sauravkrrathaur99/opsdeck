import { getSessionToken, clearSession } from './auth';

const API = '/api';

let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function notifyUnauthorized() {
  clearSession();
  onUnauthorized?.();
}

async function request(path, options = {}) {
  const token = getSessionToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.code === 'AUTH_REQUIRED') {
    clearSession();
    onUnauthorized?.();
    throw new Error('Session expired — please log in again');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  auth: {
    status: () => request('/auth/status'),
    login: (accessToken) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ accessToken }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  connections: {
    list: () => request('/connections'),
    create: (data) => request('/connections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/connections/${id}`, { method: 'DELETE' }),
    test: (id) => request(`/connections/${id}/test`, { method: 'POST' }),
    warmup: (id) => request(`/connections/${id}/warmup`, { method: 'POST' }),
  },
  commands: {
    list: (connectionId) => request(`/commands${connectionId ? `?connection_id=${connectionId}` : ''}`),
    create: (data) => request('/commands', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/commands/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/commands/${id}`, { method: 'DELETE' }),
    run: (id, connectionId) => request(`/commands/${id}/run`, { method: 'POST', body: JSON.stringify({ connection_id: connectionId }) }),
  },
  bookmarks: {
    list: (connectionId) => request(`/bookmarks?connection_id=${connectionId}`),
    create: (data) => request('/bookmarks', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/bookmarks/${id}`, { method: 'DELETE' }),
  },
  files: {
    list: (connectionId, path, { dirsOnly = false } = {}) =>
      request(`/files?connection_id=${connectionId}&path=${encodeURIComponent(path)}${dirsOnly ? '&dirs_only=1' : ''}`),
    listDirs: (connectionId, path) =>
      request(`/files?connection_id=${connectionId}&path=${encodeURIComponent(path)}&dirs_only=1`),
    read: (connectionId, path) =>
      request(`/files/read?connection_id=${connectionId}&path=${encodeURIComponent(path)}`),
    write: (connectionId, path, content) =>
      request('/files/write', {
        method: 'PUT',
        body: JSON.stringify({ connection_id: connectionId, path, content }),
      }),
    search: (connectionId, root, q, limit = 40) =>
      request(`/files/search?connection_id=${connectionId}&root=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}&limit=${limit}`),
    gitInfo: (connectionId, path, { hasDotGit = false } = {}) =>
      request(`/files/git-info?connection_id=${connectionId}&path=${encodeURIComponent(path)}${hasDotGit ? '&has_dot_git=1' : ''}`),
  },
  folderCommands: {
    list: (connectionId, folderPath) =>
      request(`/folder-commands?connection_id=${connectionId}&folder_path=${encodeURIComponent(folderPath)}`),
    create: (data) => request('/folder-commands', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/folder-commands/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/folder-commands/${id}`, { method: 'DELETE' }),
    run: (connectionId, folderPath, command, label) =>
      request('/folder-commands/run', {
        method: 'POST',
        body: JSON.stringify({ connection_id: connectionId, folder_path: folderPath, command, label }),
      }),
  },
  commandHistory: {
    list: (connectionId, folderPath, limit = 50) =>
      request(`/command-history?connection_id=${connectionId}&folder_path=${encodeURIComponent(folderPath)}&limit=${limit}`),
    save: (data) => request('/command-history', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/command-history/${id}`, { method: 'DELETE' }),
  },
  folderActivity: {
    get: (connectionId, folderPath) =>
      request(`/folder-activity?connection_id=${connectionId}&folder_path=${encodeURIComponent(folderPath)}`),
  },
  processes: {
    list: (connectionId) => request(`/processes?connection_id=${connectionId}`),
    logs: (connectionId, type, target, lines = 150, filter) =>
      request('/processes/logs', {
        method: 'POST',
        body: JSON.stringify({ connection_id: connectionId, type, target, lines, filter }),
      }),
  },
};
