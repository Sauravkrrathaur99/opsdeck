import { readFileSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const ENCRYPTED_PAYLOAD_RE = /^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+$/i;

export function normalizePrivateKey(raw) {
  if (!raw) return null;

  let key = raw.trim().replace(/\r\n/g, '\n');

  if (ENCRYPTED_PAYLOAD_RE.test(key)) {
    return null;
  }

  if (!key.includes('BEGIN')) {
    const body = key.split('\n').map((line) => line.trim()).filter(Boolean);
    if (body.length === 0) return null;
    key = `-----BEGIN OPENSSH PRIVATE KEY-----\n${body.join('\n')}\n-----END OPENSSH PRIVATE KEY-----`;
  }

  return key;
}

export function resolveKeyPath(inputPath) {
  if (!inputPath) return null;

  let expanded = inputPath.trim();

  if (expanded.startsWith('~')) {
    expanded = joinPath(homedir(), expanded.slice(1).replace(/^[\\/]/, ''));
  }

  return resolve(expanded);
}

function joinPath(base, rest) {
  return resolve(base, rest);
}

const keyFileCache = new Map();

export function readPrivateKeyFromPath(inputPath) {
  const filePath = resolveKeyPath(inputPath);
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`SSH key file not found: ${inputPath}`);
  }

  const mtime = statSync(filePath).mtimeMs;
  const cacheKey = `${filePath}:${mtime}`;
  if (keyFileCache.has(cacheKey)) return keyFileCache.get(cacheKey);

  const raw = readFileSync(filePath, 'utf8');
  const normalized = normalizePrivateKey(raw);

  if (!normalized) {
    throw new Error(`Could not read SSH key from: ${inputPath}`);
  }

  keyFileCache.set(cacheKey, normalized);
  return normalized;
}
