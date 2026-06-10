const memory = new Map();
const TTL = 5 * 60 * 1000;

function storageKey(key) {
  return `opsdeck-cache:${key}`;
}

export function getFileCache(key) {
  const mem = memory.get(key);
  if (mem && Date.now() < mem.expires) return mem.data;

  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(storageKey(key));
      return null;
    }
    memory.set(key, entry);
    return entry.data;
  } catch {
    return null;
  }
}

export function setFileCache(key, data) {
  const entry = { data, expires: Date.now() + TTL };
  memory.set(key, entry);
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}
