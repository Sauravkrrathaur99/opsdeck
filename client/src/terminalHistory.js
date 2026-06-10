const STORAGE_KEY = 'opsdeck-terminal-history';
const MAX_CHARS = 400_000;
const MAX_ENTRIES = 80;

function entryKey(connectionId, sessionId) {
  return `${connectionId}:${sessionId}`;
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function loadTerminalHistory(connectionId, sessionId) {
  const store = readStore();
  const entry = store[entryKey(connectionId, sessionId)];
  return typeof entry?.text === 'string' ? entry.text : '';
}

export function saveTerminalHistory(connectionId, sessionId, text, meta = {}) {
  if (!connectionId || !sessionId) return;
  const trimmed = text.slice(-MAX_CHARS);
  const store = readStore();
  const key = entryKey(connectionId, sessionId);
  store[key] = {
    text: trimmed,
    updatedAt: Date.now(),
    initialPath: meta.initialPath || store[key]?.initialPath || null,
  };

  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota — drop oldest half
    const sorted = keys.sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0));
    sorted.slice(0, Math.floor(sorted.length / 2)).forEach((k) => delete store[k]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore
    }
  }
}

export function clearTerminalHistory(connectionId, sessionId) {
  const store = readStore();
  delete store[entryKey(connectionId, sessionId)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
