const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const http = require('http');
const { join } = require('path');
const { prepareConfig } = require('./config.cjs');

const ROOT = join(__dirname, '..');
const PORT_SCAN_START = 3847;
const PORT_SCAN_END = 3946;
let mainWindow = null;
let setupWindow = null;
let serverHandle = null;

function getPreloadPath() {
  return join(__dirname, 'preload.cjs');
}

function resolveNodeExecutable() {
  if (app.isPackaged) {
    return process.execPath;
  }
  if (process.env.OPSDECK_NODE) {
    return process.env.OPSDECK_NODE;
  }
  return process.platform === 'win32'
    ? join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')
    : 'node';
}

function probeOpsDeck(host, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/auth/status`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function findRunningOpsDeck(host = '127.0.0.1', dataDir) {
  const portFile = join(dataDir, '.opsdeck-port');
  if (existsSync(portFile)) {
    try {
      const saved = Number(readFileSync(portFile, 'utf8').trim());
      if (saved > 0 && await probeOpsDeck(host, saved)) {
        return { host, port: saved, reused: true };
      }
    } catch {
      // ignore
    }
  }

  for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port += 1) {
    if (await probeOpsDeck(host, port)) {
      return { host, port, reused: true };
    }
  }
  return null;
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'OpsDeck',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url);
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSetupWindow() {
  return new Promise((resolve) => {
    setupWindow = new BrowserWindow({
      width: 520,
      height: 420,
      resizable: false,
      title: 'OpsDeck Setup',
      autoHideMenuBar: true,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    setupWindow.loadFile(join(__dirname, 'setup.html'));
    setupWindow.on('closed', () => {
      setupWindow = null;
    });

    ipcMain.handleOnce('opsdeck:save-token', async (_evt, token) => {
      try {
        prepareConfig(app, { accessToken: token });
        setupWindow?.close();
        resolve(true);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  });
}

function spawnOpsDeckOnPort(envFile, dataDir, port) {
  const host = '127.0.0.1';
  const nodeExe = resolveNodeExecutable();
  const serverEntry = join(ROOT, 'server', 'index.js');

  const env = {
    ...process.env,
    OPSDECK_ENV_FILE: envFile,
    OPSDECK_DATA_DIR: dataDir,
    HOST: host,
    PORT: String(port),
  };
  delete env.MASTER_KEY;
  delete env.OPSDECK_ACCESS_TOKEN;
  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';

    const child = spawn(nodeExe, [serverEntry], {
      env,
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const finish = (info) => {
      if (settled) return;
      settled = true;
      serverHandle = { child, host: info.host, port: info.port, reused: false };
      resolve(info);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(err);
    };

    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/OPSDECK_READY:([^:]+):(\d+)/);
      if (match) {
        finish({ host: match[1], port: Number(match[2]), reused: false });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => fail(err));

    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        const retry = stderr.includes('EADDRINUSE');
        fail(Object.assign(new Error(stderr.trim() || `Server exited with code ${code}`), { retry }));
      }
    });

    setTimeout(() => {
      if (!settled) fail(new Error('OpsDeck server did not become ready in time.'));
    }, 20000);
  });
}

async function spawnOpsDeckServer(envFile, dataDir) {
  const host = '127.0.0.1';
  let lastError = null;

  for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port += 1) {
    if (await probeOpsDeck(host, port)) continue;
    try {
      return await spawnOpsDeckOnPort(envFile, dataDir, port);
    } catch (err) {
      if (err.retry) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(lastError?.message || `No free port in ${PORT_SCAN_START}-${PORT_SCAN_END}`);
}

async function startBackend(envFile, dataDir) {
  const existing = await findRunningOpsDeck('127.0.0.1', dataDir);
  if (existing) {
    serverHandle = { child: null, host: existing.host, port: existing.port, reused: true };
    return existing;
  }

  return spawnOpsDeckServer(envFile, dataDir);
}

async function boot() {
  const initial = prepareConfig(app);

  if (initial.needsSetup) {
    await createSetupWindow();
  }

  const ready = prepareConfig(app);
  if (ready.needsSetup) {
    await dialog.showErrorBox(
      'OpsDeck setup required',
      'An access token is required. Restart OpsDeck and enter the team token.',
    );
    app.quit();
    return;
  }

  try {
    const info = await startBackend(ready.envFile, ready.dataDir);
    createMainWindow(`http://${info.host}:${info.port}`);
  } catch (err) {
    await dialog.showErrorBox('OpsDeck failed to start', err.message);
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (serverHandle?.child && !serverHandle.reused) {
    serverHandle.child.kill();
  }
  serverHandle = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && serverHandle) {
    createMainWindow(`http://${serverHandle.host}:${serverHandle.port}`);
  }
});

app.on('before-quit', () => {
  if (serverHandle?.child && !serverHandle.reused) {
    serverHandle.child.kill();
  }
});
