import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getDataDir } from './paths.js';

function portFilePath() {
  return join(getDataDir(), '.opsdeck-port');
}

export function writePortFile(port) {
  writeFileSync(portFilePath(), String(port), 'utf8');
}

export function readPortFile() {
  try {
    const raw = readFileSync(portFilePath(), 'utf8').trim();
    const port = Number(raw);
    return Number.isFinite(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

export function clearPortFile() {
  try {
    if (existsSync(portFilePath())) {
      writeFileSync(portFilePath(), '', 'utf8');
    }
  } catch {
    // ignore
  }
}
