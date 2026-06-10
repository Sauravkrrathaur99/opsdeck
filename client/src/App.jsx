import { useState, useEffect, useCallback } from 'react';
import {
  Terminal as TerminalIcon, FolderOpen, Zap, Activity,
  LayoutDashboard, ChevronLeft, ChevronRight, Loader2, LogOut,
} from 'lucide-react';
import { api, setUnauthorizedHandler } from './api';
import { clearSession } from './auth';
import LoginGate from './components/LoginGate';
import {
  loadSessions, saveSession, getSession, getActiveTerminalId,
  loadAppPrefs, saveAppPrefs, getStoredTab, VALID_TABS,
} from './sessionStorage';
import { getFileCache, setFileCache } from './fileCache';
import ConnectionManager from './components/ConnectionManager';
import TerminalWorkspace from './components/TerminalWorkspace';
import FileBrowser from './components/FileBrowser';
import SavedCommands from './components/SavedCommands';
import ProcessMonitor from './components/ProcessMonitor';

const TABS = [
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'commands', label: 'Commands', icon: Zap },
  { id: 'services', label: 'Services', icon: Activity },
];

const runInTerminal = (connectionId, command) => {
  const terminalId = getActiveTerminalId(connectionId);
  const send = window.__opsdeckTerminals?.[connectionId]?.[terminalId];
  if (send) {
    send(command + '\n');
    return true;
  }
  return false;
};

const DEFAULT_COMMANDS = [
  { name: 'Check disk space', command: 'df -h', category: 'General', description: 'Show disk usage' },
  { name: 'Memory usage', command: 'free -h', category: 'General', description: 'Show RAM usage' },
  { name: 'Running processes', command: 'htop || top -bn1 | head -20', category: 'General', description: 'View processes' },
  { name: 'List home directory', command: 'ls -la ~/', category: 'General', description: 'Browse home folder' },
  { name: 'Nginx status', command: 'sudo systemctl status nginx', category: 'Nginx', description: 'Check nginx service' },
  { name: 'Restart Nginx', command: 'sudo systemctl restart nginx', category: 'Nginx', description: 'Restart web server' },
  { name: 'Docker containers', command: 'docker ps -a', category: 'Docker', description: 'List all containers' },
  { name: 'Docker logs (last 50)', command: 'docker logs --tail 50 $(docker ps -q | head -1)', category: 'Docker', description: 'Recent container logs' },
  { name: 'PM2 status', command: 'pm2 status', category: 'Deploy', description: 'Check PM2 processes' },
  { name: 'PM2 restart all', command: 'pm2 restart all', category: 'Deploy', description: 'Restart all PM2 apps' },
  { name: 'View nginx error log', command: 'sudo tail -50 /var/log/nginx/error.log', category: 'Logs', description: 'Recent nginx errors' },
  { name: 'System uptime', command: 'uptime && uname -a', category: 'Maintenance', description: 'Server uptime & info' },
];

const appPrefs = loadAppPrefs();

export default function App() {
  const [connections, setConnections] = useState([]);
  const [activeConnection, setActiveConnection] = useState(appPrefs.lastConnectionId || null);
  const [activeTab, setActiveTab] = useState(
    VALID_TABS.includes(appPrefs.lastTab) ? appPrefs.lastTab : 'terminal'
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setSessions] = useState(loadSessions);
  const [fileNavTarget, setFileNavTarget] = useState(null);
  const [authState, setAuthState] = useState('loading');
  const [secured, setSecured] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState('login'));
    api.auth.status()
      .then((s) => {
        setSecured(s.secured);
        setAuthState(s.authenticated ? 'ok' : 'login');
      })
      .catch(() => setAuthState('login'));
  }, []);

  const handleLogout = async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    clearSession();
    setAuthState('login');
  };

  const loadConnections = useCallback(async () => {
    try {
      const data = await api.connections.list();
      setConnections(data);
      if (data.length === 0) return;

      const prefs = loadAppPrefs();
      const remembered = data.find((c) => c.id === prefs.lastConnectionId);
      const connId = remembered?.id || activeConnection || data[0].id;
      setActiveConnection(connId);

      const savedTab = getStoredTab(connId) || (VALID_TABS.includes(prefs.lastTab) ? prefs.lastTab : 'terminal');
      setActiveTab(savedTab);
    } catch {
      setConnections([]);
    }
  }, [activeConnection]);

  const selectConnection = useCallback((connectionId) => {
    setActiveConnection(connectionId);
    const tab = getStoredTab(connectionId) || activeTab;
    setActiveTab(tab);
    saveAppPrefs({ lastConnectionId: connectionId, lastTab: tab });
  }, [activeTab]);

  const selectTab = useCallback((tabId) => {
    setActiveTab(tabId);
    saveAppPrefs({ lastTab: tabId, lastConnectionId: activeConnection });
    if (activeConnection) {
      const updated = saveSession(activeConnection, { activeTab: tabId });
      setSessions((prev) => ({ ...prev, [activeConnection]: updated }));
    }
  }, [activeConnection]);

  const seedDefaultCommands = useCallback(async () => {
    try {
      const existing = await api.commands.list();
      if (existing.length === 0) {
        for (const cmd of DEFAULT_COMMANDS) {
          await api.commands.create(cmd);
        }
      }
    } catch {
      // ignore seed errors
    }
  }, []);

  const prefetchFolders = useCallback((connectionId, username) => {
    if (!connectionId) return;
    const homePath = `/home/${username}`;
    const cacheKey = `${connectionId}:${homePath}:dirs`;
    if (getFileCache(cacheKey)) return;
    api.files.listDirs(connectionId, homePath)
      .then((data) => {
        const dirs = data.items.filter((item) => item.type === 'directory');
        setFileCache(cacheKey, dirs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authState !== 'ok') return;
    loadConnections();
    seedDefaultCommands();
  }, [authState]);

  useEffect(() => {
    const conn = connections.find((c) => c.id === activeConnection);
    if (conn) {
      prefetchFolders(conn.id, conn.username);
      api.connections.warmup(conn.id).catch(() => {});
    }
  }, [activeConnection, connections, prefetchFolders]);

  useEffect(() => {
    if (!activeConnection) return;
    const keepAlive = setInterval(() => {
      api.connections.warmup(activeConnection).catch(() => {});
    }, 90000);
    return () => clearInterval(keepAlive);
  }, [activeConnection]);

  const updateFilePath = useCallback((connectionId, path) => {
    const updated = saveSession(connectionId, { filePath: path });
    setSessions((prev) => ({ ...prev, [connectionId]: updated }));
  }, []);

  const handleOpenFolder = useCallback((connectionId, path) => {
    saveSession(connectionId, { filePath: path, activeTab: 'files' });
    setSessions((prev) => ({ ...prev, [connectionId]: { ...prev[connectionId], filePath: path, activeTab: 'files' } }));
    setActiveConnection(connectionId);
    setActiveTab('files');
    saveAppPrefs({ lastConnectionId: connectionId, lastTab: 'files' });
    setFileNavTarget({ connectionId, path, key: Date.now() });
  }, []);

  const activeConn = connections.find((c) => c.id === activeConnection);

  if (authState === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-900 text-gray-500">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (authState === 'login') {
    return (
      <LoginGate
        secured={secured}
        onSuccess={() => {
          setAuthState('ok');
          loadConnections();
          seedDefaultCommands();
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-surface-600/50 bg-surface-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-lg shadow-accent/25">
            <LayoutDashboard size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">OpsDeck</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5">VPS Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-surface-700/50 rounded-lg p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-accent text-white shadow-md shadow-accent/25'
                    : 'text-gray-400 hover:text-white hover:bg-surface-600/50'
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {secured && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-danger"
              title="Lock OpsDeck"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} shrink-0 border-r border-surface-600/50 bg-surface-800/50 transition-all duration-300 overflow-hidden flex flex-col`}>
          <div className="flex-1 overflow-y-auto p-4">
            <ConnectionManager
              connections={connections}
              activeId={activeConnection}
              onSelect={selectConnection}
              onUpdate={loadConnections}
              onOpenFolder={handleOpenFolder}
            />
          </div>
        </aside>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-5 shrink-0 flex items-center justify-center bg-surface-700/30 hover:bg-surface-600/50 border-r border-surface-600/30 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        </button>

        <main className="flex-1 min-w-0 p-3">
          {!activeConnection && connections.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center animate-fade-in">
                <div className="w-20 h-20 rounded-2xl bg-surface-700/50 flex items-center justify-center mx-auto mb-4">
                  <TerminalIcon size={36} className="text-gray-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-300 mb-2">Welcome to OpsDeck</h2>
                <p className="text-sm text-gray-500 max-w-md">
                  Add your Hostinger VPS connection in the sidebar to get started.
                  Run commands, browse files, and save your favorite scripts — all from one place.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full relative">
              {connections.filter((c) => c.id === activeConnection).map((conn) => (
                <div key={conn.id} className="absolute inset-0 z-10">
                  <div className={`h-full ${activeTab === 'terminal' ? '' : 'hidden'}`}>
                    <TerminalWorkspace
                      connectionId={conn.id}
                      connectionName={conn.name}
                      visible={activeTab === 'terminal'}
                    />
                  </div>
                  <div className={`h-full ${activeTab === 'files' ? '' : 'hidden'}`}>
                    <FileBrowser
                      connectionId={conn.id}
                      homePath={`/home/${conn.username}`}
                      visible={activeTab === 'files'}
                      savedPath={getSession(conn.id).filePath}
                      onPathChange={(path) => updateFilePath(conn.id, path)}
                      navigateTo={
                        fileNavTarget?.connectionId === conn.id ? fileNavTarget.path : null
                      }
                      onNavigateDone={() => setFileNavTarget(null)}
                      onNavigate={(path) => {
                        runInTerminal(conn.id, `cd "${path}" && pwd`);
                      }}
                      onRunCommand={(command) => {
                        runInTerminal(conn.id, command);
                      }}
                    />
                  </div>
                  <div className={`h-full ${activeTab === 'commands' ? '' : 'hidden'}`}>
                    <SavedCommands connectionId={conn.id} />
                  </div>
                  <div className={`h-full ${activeTab === 'services' ? '' : 'hidden'}`}>
                    <ProcessMonitor
                      connectionId={conn.id}
                      connectionName={conn.name}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
