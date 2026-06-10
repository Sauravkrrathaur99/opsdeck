import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

export function getDataDir() {
  if (process.env.OPSDECK_DATA_DIR) {
    return process.env.OPSDECK_DATA_DIR;
  }
  return join(projectRoot, 'data');
}

export function getProjectRoot() {
  return projectRoot;
}
