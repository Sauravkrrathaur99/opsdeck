import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { existsSync } from 'fs';
import { createRoutes } from './routes.js';
import { attachTerminalSocket } from './terminalWs.js';
import {
  resolveAccessToken, assertProductionSecrets, createWsAuthVerifier,
} from './auth.js';
import { securityHeaders } from './security.js';
import { getProjectRoot } from './paths.js';

export function createOpsDeckApp({ masterKey, authConfig }) {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });
  const verifyWsAuth = createWsAuthVerifier(authConfig.token);

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createRoutes(masterKey, authConfig));

  wss.on('connection', (ws, req) => {
    if (!verifyWsAuth(req)) {
      ws.send(JSON.stringify({ type: 'error', data: 'Unauthorized — login required' }));
      ws.close(4401, 'Unauthorized');
      return;
    }
    attachTerminalSocket(ws, req, masterKey);
  });

  const clientDist = join(getProjectRoot(), 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return { app, server };
}

export function startOpsDeckServer(env = process.env) {
  const HOST = env.HOST || '127.0.0.1';
  const MASTER_KEY = env.MASTER_KEY || 'opsdeck-dev-key-change-in-production';
  const requestedPort = env.PORT === '0' || env.PORT === 0
    ? 0
    : (Number(env.PORT) || 3847);

  const authConfig = resolveAccessToken(env.OPSDECK_ACCESS_TOKEN, HOST);
  assertProductionSecrets({
    masterKey: MASTER_KEY,
    host: HOST,
    accessRequired: authConfig.required,
  });

  const { server } = createOpsDeckApp({ masterKey: MASTER_KEY, authConfig });

  return new Promise((resolve, reject) => {
    server.listen(requestedPort, HOST, () => {
      const { port } = server.address();
      resolve({ server, port, host: HOST });
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${requestedPort} is already in use.`));
      } else {
        reject(err);
      }
    });
  });
}
