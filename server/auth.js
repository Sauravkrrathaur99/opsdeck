import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

function safeEqual(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function resolveAccessToken(envToken, host) {
  const token = envToken?.trim();
  const isLocal = host === '127.0.0.1' || host === 'localhost';

  if (token && token.length >= 16) {
    return { token, required: true, isLocal };
  }

  if (!isLocal) {
    throw new Error(
      'OPSDECK_ACCESS_TOKEN is required when HOST is not 127.0.0.1. ' +
      'Set a long random token in .env before exposing OpsDeck online.'
    );
  }

  if (token && token.length < 16) {
    throw new Error('OPSDECK_ACCESS_TOKEN must be at least 16 characters.');
  }

  console.warn('\n⚠️  OPSDECK_ACCESS_TOKEN not set — localhost only, no login required.');
  console.warn('   Set OPSDECK_ACCESS_TOKEN in .env before going online.\n');
  return { token: null, required: false, isLocal: true };
}

export function assertProductionSecrets({ masterKey, host, accessRequired }) {
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  if (isLocal && !accessRequired) return;

  if (masterKey === 'opsdeck-dev-key-change-in-production' || !masterKey || masterKey.length < 24) {
    throw new Error('MASTER_KEY must be a long random secret (24+ chars) for production use.');
  }
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, exp] of sessions) {
    if (exp < now) sessions.delete(id);
  }
}

export function createSession(accessToken) {
  pruneSessions();
  const id = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', accessToken).update(id).digest('hex');
  const session = `${id}.${sig}`;
  sessions.set(session, Date.now() + SESSION_TTL_MS);
  return session;
}

export function verifySession(session, accessToken) {
  if (!accessToken || !session) return false;
  pruneSessions();
  const exp = sessions.get(session);
  if (!exp || exp < Date.now()) {
    sessions.delete(session);
    return false;
  }
  const [id, sig] = session.split('.');
  if (!id || !sig) return false;
  const expected = createHmac('sha256', accessToken).update(id).digest('hex');
  return safeEqual(sig, expected);
}

export function destroySession(session) {
  sessions.delete(session);
}

export function extractBearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export function createAuthMiddleware(accessToken) {
  return (req, res, next) => {
    if (!accessToken) {
      req.authenticated = true;
      return next();
    }
    const session = extractBearer(req);
    if (verifySession(session, accessToken)) {
      req.authenticated = true;
      req.sessionToken = session;
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  };
}

export function createWsAuthVerifier(accessToken) {
  return (req) => {
    if (!accessToken) return true;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || extractBearer(req);
    return verifySession(token, accessToken);
  };
}

export function checkLoginRate(ip) {
  const key = ip || 'unknown';
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    loginAttempts.delete(key);
  }
  return { allowed: true };
}

export function recordLoginFailure(ip) {
  const key = ip || 'unknown';
  const entry = loginAttempts.get(key) || { count: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

export function recordLoginSuccess(ip) {
  loginAttempts.delete(ip || 'unknown');
}

export function loginWithToken(provided, accessToken) {
  return safeEqual(provided?.trim() || '', accessToken);
}
