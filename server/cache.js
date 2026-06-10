const store = new Map();

export function getCache(key) {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data, ttlMs = 60000) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
