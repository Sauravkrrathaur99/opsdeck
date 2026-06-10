const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:"
  );
  next();
}

export function validateRemotePath(path) {
  if (!path || typeof path !== 'string') throw new Error('Invalid path');
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) throw new Error('Path must be absolute');
  if (trimmed.includes('\0') || trimmed.includes('..')) throw new Error('Invalid path');
  if (/[;|&$`<>]/.test(trimmed)) throw new Error('Invalid characters in path');
  return trimmed;
}

export function validateConnectionId(id) {
  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error('Invalid connection id');
  }
  return id;
}

export function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}
