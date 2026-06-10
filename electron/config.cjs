const { randomBytes } = require('crypto');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function serializeEnv(vars) {
  return [
    '# OpsDeck desktop config — do not share this file',
    `PORT=${vars.PORT || '3847'}`,
    `HOST=${vars.HOST || '127.0.0.1'}`,
    `MASTER_KEY=${vars.MASTER_KEY}`,
    vars.OPSDECK_ACCESS_TOKEN ? `OPSDECK_ACCESS_TOKEN=${vars.OPSDECK_ACCESS_TOKEN}` : '',
    '',
  ].filter(Boolean).join('\n');
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function getPaths(app) {
  const projectRoot = join(__dirname, '..');
  if (!app.isPackaged) {
    return {
      root: projectRoot,
      envFile: join(projectRoot, '.env'),
      dataDir: join(projectRoot, 'data'),
    };
  }
  const root = app.getPath('userData');
  return {
    root,
    envFile: join(root, '.env'),
    dataDir: join(root, 'data'),
  };
}

function readConfig(app) {
  const { envFile } = getPaths(app);
  if (!existsSync(envFile)) return {};
  return parseEnv(readFileSync(envFile, 'utf8'));
}

function writeConfig(app, vars) {
  const { envFile, dataDir } = getPaths(app);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(envFile, serializeEnv(vars), 'utf8');
  return envFile;
}

function ensureMasterKey(vars) {
  if (!vars.MASTER_KEY || vars.MASTER_KEY.length < 24) {
    vars.MASTER_KEY = generateSecret(32);
  }
  return vars;
}

function needsAccessToken(vars) {
  const token = vars.OPSDECK_ACCESS_TOKEN?.trim();
  return !token || token.length < 16;
}

function prepareConfig(app, { accessToken } = {}) {
  const paths = getPaths(app);
  mkdirSync(paths.dataDir, { recursive: true });

  let vars = readConfig(app);
  vars = ensureMasterKey(vars);
  vars.PORT = vars.PORT || '3847';
  vars.HOST = '127.0.0.1';

  const buildToken = process.env.OPSDECK_BUILD_TOKEN?.trim();
  if (accessToken?.trim()) {
    vars.OPSDECK_ACCESS_TOKEN = accessToken.trim();
  } else if (buildToken && buildToken.length >= 16) {
    vars.OPSDECK_ACCESS_TOKEN = buildToken;
  }

  if (app.isPackaged) {
    writeConfig(app, vars);
  } else if (!existsSync(paths.envFile)) {
    writeConfig(app, vars);
  }

  return {
    envFile: paths.envFile,
    dataDir: paths.dataDir,
    needsSetup: needsAccessToken(vars),
    vars,
  };
}

module.exports = {
  getPaths,
  readConfig,
  writeConfig,
  prepareConfig,
  needsAccessToken,
};
