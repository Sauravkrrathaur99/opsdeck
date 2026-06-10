import { config } from 'dotenv';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { startOpsDeckServer } from './start.js';
import { writePortFile, clearPortFile } from './portFile.js';

if (process.env.OPSDECK_ENV_FILE) {
  config({ path: process.env.OPSDECK_ENV_FILE, override: true });
} else {
  config({ override: true });
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startOpsDeckServer()
    .then(({ host, port, server }) => {
      writePortFile(port);
      server.on('close', () => clearPortFile());
      console.log(`OPSDECK_READY:${host}:${port}`);
      console.log(`
  ╔══════════════════════════════════════════╗
  ║         OpsDeck — VPS Command Center     ║
  ╠══════════════════════════════════════════╣
  ║  Local:   http://${host}:${port}              ║
  ║  API:     http://${host}:${port}/api          ║
  ╚══════════════════════════════════════════╝
  `);
    })
    .catch((err) => {
      if (err.message?.includes('already in use')) {
        console.error(`\n  ${err.message}`);
        console.error('  If you have an SSH tunnel (ssh -L 3847:...), close it first, then restart.');
        console.error('  Or run:  netstat -ano | findstr :3847   to find the blocking PID.\n');
      } else {
        console.error('Server failed to start:', err.message);
      }
      process.exit(1);
    });
}
