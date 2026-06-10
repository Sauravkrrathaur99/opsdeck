const STORAGE_KEY = 'opsdeck-sessions';
const APP_KEY = 'opsdeck-app';
export const VALID_TABS = ['terminal', 'files', 'commands', 'services'];

export function loadAppPrefs() {
  try {
    return JSON.parse(localStorage.getItem(APP_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveAppPrefs(updates) {
  const prefs = { ...loadAppPrefs(), ...updates };
  localStorage.setItem(APP_KEY, JSON.stringify(prefs));
  return prefs;
}

export function getStoredTab(connectionId) {
  const tab = getSession(connectionId).activeTab;
  return VALID_TABS.includes(tab) ? tab : null;
}

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSession(connectionId, updates) {
  const sessions = loadSessions();
  sessions[connectionId] = { ...sessions[connectionId], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return sessions[connectionId];
}

export function getSession(connectionId) {
  return loadSessions()[connectionId] || {};
}

export function getActiveTerminalId(connectionId) {
  const session = getSession(connectionId);
  if (session.activeTerminalId) return session.activeTerminalId;
  if (session.terminalSessions?.[0]?.id) return session.terminalSessions[0].id;
  return 't1';
}
