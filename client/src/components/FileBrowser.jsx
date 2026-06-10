import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Folder, File, ChevronRight, Home, Star, Eye, EyeOff,
  ArrowUp, HardDrive, Loader2, Search, ArrowUpDown, Shield, KeyRound,
} from 'lucide-react';
import {
  AnimatedGridIcon, AnimatedListIcon, AnimatedEyeIcon, AnimatedEyeOffIcon,
  AnimatedFilterIcon, AnimatedStarIcon, AnimatedStarOffIcon,
  AnimatedPanelIcon, AnimatedTerminalIcon, AnimatedGitIcon, AnimatedRefreshIcon,
} from './AnimatedToolbarIcons';
import { api } from '../api';
import { getFileCache, setFileCache } from '../fileCache';
import { loadExplorerPrefs, saveExplorerPrefs } from '../explorerPrefs';
import { isSecretFile, deriveProjectRoot } from '../fileUtils';
import { detectProject } from '../projectDetect';
import { useFolderActivity } from '../hooks/useFolderActivity';
import { useGitRepo } from '../hooks/useGitRepo';
import FolderCommandDrawer from './FolderCommandDrawer';
import FolderTerminalDrawer from './FolderTerminalDrawer';
import GitTerminalDrawer from './GitTerminalDrawer';
import FolderServerStatusBadge from './FolderServerStatusBadge';
import FileEditor from './FileEditor';

function formatSize(bytes) {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const GRID_CONFIG = {
  small: { cols: 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6', icon: 22, pad: 'p-2', text: 'text-[10px]', gap: 'gap-2' },
  medium: { cols: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5', icon: 32, pad: 'p-3', text: 'text-xs', gap: 'gap-3' },
  large: { cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', icon: 48, pad: 'p-4', text: 'text-sm', gap: 'gap-4' },
};

function FileIcon({ item }) {
  if (item.type === 'directory') return <Folder size={18} className="text-accent shrink-0" />;
  if (isSecretFile(item.name)) return <KeyRound size={18} className="text-warning shrink-0" />;
  return <File size={18} className="text-gray-500 shrink-0" />;
}

function FileListItem({ item, onOpen, onFileOpen }) {
  const secret = item.type === 'file' && isSecretFile(item.name);
  return (
    <button
      onClick={() => (item.type === 'directory' ? onOpen(item.path) : onFileOpen?.(item))}
      onDoubleClick={() => (item.type === 'directory' ? onOpen(item.path) : onFileOpen?.(item))}
      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-700/50 transition-colors text-left group ${
        secret ? 'bg-warning/5 hover:bg-warning/10' : ''
      }`}
    >
      <FileIcon item={item} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate group-hover:text-accent transition-colors ${secret ? 'text-warning' : ''}`}>
          {item.name}
        </div>
      </div>
      {secret && <Shield size={12} className="text-warning/60 shrink-0" />}
      <span className="text-xs text-gray-500 shrink-0">{formatSize(item.size)}</span>
    </button>
  );
}

function FileGridItem({ item, gridSize, onOpen, onFileOpen }) {
  const cfg = GRID_CONFIG[gridSize];
  const secret = item.type === 'file' && isSecretFile(item.name);

  return (
    <button
      onClick={() => (item.type === 'directory' ? onOpen(item.path) : onFileOpen?.(item))}
      onDoubleClick={() => (item.type === 'directory' ? onOpen(item.path) : onFileOpen?.(item))}
      className={`flex flex-col items-center ${cfg.pad} rounded-xl hover:bg-surface-700/50 border transition-all text-center group ${
        secret ? 'border-warning/20 bg-warning/5 hover:border-warning/40' : 'border-transparent hover:border-surface-600/50'
      }`}
    >
      {item.type === 'directory' ? (
        <Folder size={cfg.icon} className="text-accent mb-2" />
      ) : secret ? (
        <KeyRound size={cfg.icon} className="text-warning mb-2" />
      ) : (
        <File size={cfg.icon} className="text-gray-500 mb-2" />
      )}
      <span className={`${cfg.text} truncate w-full group-hover:text-accent transition-colors ${secret ? 'text-warning' : ''}`}>
        {item.name}
      </span>
      {item.type === 'file' && (
        <span className="text-[10px] text-gray-600 mt-0.5">{formatSize(item.size)}</span>
      )}
    </button>
  );
}

export default function FileBrowser({
  connectionId,
  homePath = '/home/deploy',
  onNavigate,
  savedPath,
  onPathChange,
  navigateTo,
  onNavigateDone,
  onRunCommand,
}) {
  const [prefs, setPrefs] = useState(loadExplorerPrefs);
  const [search, setSearch] = useState('');
  const [currentPath, setCurrentPath] = useState(savedPath || homePath);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [folderTerminalOpen, setFolderTerminalOpen] = useState(false);
  const [gitTerminalOpen, setGitTerminalOpen] = useState(false);
  const [openFile, setOpenFile] = useState(null);
  const [nearbySecrets, setNearbySecrets] = useState([]);

  const project = useMemo(() => detectProject(items), [items]);
  const isProjectFolder = project.type !== 'generic';
  const { activity, loading: activityLoading } = useFolderActivity(connectionId, currentPath, {
    enabled: !!connectionId && isProjectFolder,
    intervalMs: 15000,
  });
  const { gitInfo, loading: gitLoading } = useGitRepo(connectionId, currentPath, items);

  const updatePrefs = useCallback((updates) => {
    setPrefs((prev) => {
      const next = saveExplorerPrefs({ ...prev, ...updates });
      return next;
    });
  }, []);

  const loadDirectory = async (path, persist = true, { silent = false } = {}) => {
    if (!connectionId) return;

    const cacheKey = `${connectionId}:${path}:full`;
    const cached = getFileCache(cacheKey);

    if (cached && !silent) {
      setItems(cached);
      setCurrentPath(path);
      setLoading(false);
      setError(null);
      api.files.list(connectionId, path).then((data) => {
        setItems(data.items);
        setFileCache(cacheKey, data.items);
      }).catch(() => {});
      if (persist) onPathChange?.(path);
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await api.files.list(connectionId, path);
      setItems(data.items);
      setCurrentPath(data.path);
      setFileCache(cacheKey, data.items);
      if (persist) onPathChange?.(data.path);
    } catch (err) {
      if (!cached) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBookmarks = async () => {
    if (!connectionId) return;
    try {
      const data = await api.bookmarks.list(connectionId);
      setBookmarks(data);
    } catch {
      setBookmarks([]);
    }
  };

  useEffect(() => {
    if (!connectionId || initialized) return;
    const startPath = savedPath || homePath;
    loadDirectory(startPath, true);
    loadBookmarks();
    setInitialized(true);
  }, [connectionId, initialized, savedPath, homePath]);

  useEffect(() => {
    if (!navigateTo || !connectionId) return;
    loadDirectory(navigateTo, true);
    setSearch('');
    onNavigateDone?.();
  }, [navigateTo]);

  const navigate = (path) => {
    loadDirectory(path);
    onNavigate?.(path);
    setSearch('');
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigate(parent);
  };

  const secretItems = useMemo(
    () => items.filter((item) => item.type === 'file' && isSecretFile(item.name)),
    [items]
  );

  useEffect(() => {
    if (!connectionId || !currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    const folders = [currentPath];
    for (let i = parts.length - 1; i >= Math.max(0, parts.length - 4); i--) {
      folders.push(i === 0 ? '/' : `/${parts.slice(0, i).join('/')}`);
    }
    const unique = [...new Set(folders)];

    Promise.all(
      unique.map(async (folderPath) => {
        try {
          const data = await api.files.list(connectionId, folderPath);
          return data.items
            .filter((item) => item.type === 'file' && isSecretFile(item.name))
            .map((item) => ({ ...item, folderPath }));
        } catch {
          return [];
        }
      })
    ).then((groups) => setNearbySecrets(groups.flat()));
  }, [connectionId, currentPath, items]);

  const parentSecrets = useMemo(() => {
    const currentDir = currentPath.replace(/\/$/, '');
    const byFolder = new Map();
    for (const item of nearbySecrets) {
      const dir = item.path.replace(/\/[^/]+$/, '').replace(/\/$/, '');
      if (dir === currentDir) continue;
      if (!byFolder.has(dir)) byFolder.set(dir, []);
      byFolder.get(dir).push(item);
    }
    return [...byFolder.entries()].sort((a, b) => b[0].length - a[0].length);
  }, [nearbySecrets, currentPath]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (!prefs.showHidden) {
      result = result.filter((item) => !item.name.startsWith('.'));
    }

    if (prefs.showSecretsOnly) {
      result = result.filter((item) => item.type === 'directory' || isSecretFile(item.name));
    }

    if (prefs.filterType === 'folders') {
      result = result.filter((item) => item.type === 'directory');
    } else if (prefs.filterType === 'files') {
      result = result.filter((item) => item.type === 'file');
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (prefs.sortBy === 'type') {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return prefs.sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      if (prefs.sortBy === 'size') {
        const diff = (a.size || 0) - (b.size || 0);
        return prefs.sortOrder === 'asc' ? diff : -diff;
      }
      return prefs.sortOrder === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });

    return result;
  }, [items, search, prefs]);

  const isBookmarked = bookmarks.some((b) => b.path === currentPath);

  const toggleBookmark = async () => {
    const existing = bookmarks.find((b) => b.path === currentPath);
    if (existing) {
      await api.bookmarks.delete(existing.id);
      setBookmarks(bookmarks.filter((b) => b.id !== existing.id));
    } else {
      const name = currentPath.split('/').pop() || 'root';
      const created = await api.bookmarks.create({
        name,
        path: currentPath,
        connection_id: connectionId,
      });
      setBookmarks([...bookmarks, created]);
    }
  };

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const gridCfg = GRID_CONFIG[prefs.gridSize];

  if (!connectionId) {
    return (
      <div className="card h-full flex items-center justify-center text-gray-500 text-sm">
        Select a VPS connection to browse files
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600/50 bg-surface-700/30">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-accent" />
          <span className="font-medium text-sm">File Browser</span>
          <span className="text-[10px] text-gray-500">{filteredItems.length} items</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updatePrefs({ viewMode: prefs.viewMode === 'list' ? 'grid' : 'list' })}
            className="group toolbar-icon-btn"
            title={prefs.viewMode === 'list' ? 'Grid view' : 'List view'}
          >
            {prefs.viewMode === 'list' ? (
              <AnimatedGridIcon />
            ) : (
              <AnimatedListIcon active />
            )}
          </button>
          <button
            onClick={() => updatePrefs({ showHidden: !prefs.showHidden })}
            className={`group toolbar-icon-btn ${prefs.showHidden ? 'toolbar-icon-btn-active ring-1 ring-warning/30' : ''}`}
            title={prefs.showHidden ? 'Hide .env & dotfiles' : 'Show hidden files (.env, .enc…)'}
          >
            {prefs.showHidden ? <AnimatedEyeIcon active /> : <AnimatedEyeOffIcon />}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`group toolbar-icon-btn ${showFilters ? 'toolbar-icon-btn-active ring-1 ring-emerald-400/30' : ''}`}
            title="Filters & sort"
          >
            <AnimatedFilterIcon active={showFilters} />
          </button>
          <button
            onClick={toggleBookmark}
            className={`group toolbar-icon-btn ${isBookmarked ? 'toolbar-icon-btn-active ring-1 ring-yellow-400/30' : ''}`}
            title="Bookmark folder"
          >
            {isBookmarked ? <AnimatedStarIcon active /> : <AnimatedStarOffIcon />}
          </button>
          <button
            onClick={() => setConsoleOpen(true)}
            className={`group toolbar-icon-btn ${consoleOpen ? 'toolbar-icon-btn-active ring-1 ring-blue-400/30' : ''}`}
            title="Folder console — shortcuts, saved commands & logs"
          >
            <AnimatedPanelIcon active={consoleOpen} />
          </button>
          <button
            onClick={() => setFolderTerminalOpen(true)}
            className={`group toolbar-icon-btn ${folderTerminalOpen ? 'toolbar-icon-btn-active ring-1 ring-emerald-400/30' : ''}`}
            title="Folder terminal — SSH shell in this folder"
          >
            <AnimatedTerminalIcon active={folderTerminalOpen} />
          </button>
          <button
            onClick={() => setGitTerminalOpen(true)}
            className={`group toolbar-icon-btn ${
              gitTerminalOpen
                ? 'toolbar-icon-btn-active ring-1 ring-orange-400/30'
                : gitInfo.isRepo
                  ? 'ring-1 ring-orange-400/20'
                  : ''
            }`}
            title={
              gitInfo.isRepo
                ? `Git terminal — ${gitInfo.branch || 'repo'}${gitInfo.dirty ? ' (changes)' : ''}`
                : 'Git terminal — opens shell for git pull, push, etc.'
            }
          >
            <AnimatedGitIcon active={gitTerminalOpen} loading={gitLoading} />
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            className="group toolbar-icon-btn"
            title="Refresh"
          >
            <AnimatedRefreshIcon loading={loading} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-surface-600/30">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field text-xs pl-8 py-1.5"
            placeholder="Search in this folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="px-3 py-2 border-b border-surface-600/30 bg-surface-800/50 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase">Type</span>
          {['all', 'folders', 'files'].map((f) => (
            <button
              key={f}
              onClick={() => updatePrefs({ filterType: f })}
              className={`text-[10px] px-2 py-1 rounded-full capitalize transition-colors ${
                prefs.filterType === f ? 'bg-accent text-white' : 'bg-surface-600/50 text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}

          <span className="text-[10px] text-gray-500 uppercase ml-2">Sort</span>
          {['name', 'size', 'type'].map((s) => (
            <button
              key={s}
              onClick={() => updatePrefs({
                sortBy: s,
                sortOrder: prefs.sortBy === s && prefs.sortOrder === 'asc' ? 'desc' : 'asc',
              })}
              className={`text-[10px] px-2 py-1 rounded-full capitalize transition-colors flex items-center gap-1 ${
                prefs.sortBy === s ? 'bg-accent text-white' : 'bg-surface-600/50 text-gray-400 hover:text-white'
              }`}
            >
              {s}
              {prefs.sortBy === s && <ArrowUpDown size={10} />}
            </button>
          ))}

          {prefs.viewMode === 'grid' && (
            <>
              <span className="text-[10px] text-gray-500 uppercase ml-2">Grid</span>
              {['small', 'medium', 'large'].map((g) => (
                <button
                  key={g}
                  onClick={() => updatePrefs({ gridSize: g })}
                  className={`text-[10px] px-2 py-1 rounded-full capitalize transition-colors ${
                    prefs.gridSize === g ? 'bg-accent text-white' : 'bg-surface-600/50 text-gray-400 hover:text-white'
                  }`}
                >
                  {g}
                </button>
              ))}
            </>
          )}

          <button
            onClick={() => updatePrefs({ showHidden: !prefs.showHidden })}
            className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 transition-colors ${
              prefs.showHidden ? 'bg-warning/20 text-warning' : 'bg-surface-600/50 text-gray-400 hover:text-white'
            }`}
          >
            {prefs.showHidden ? <Eye size={10} /> : <EyeOff size={10} />}
            Hidden (.env)
          </button>
          <button
            onClick={() => updatePrefs({ showSecretsOnly: !prefs.showSecretsOnly })}
            className={`text-[10px] px-2 py-1 rounded-full ml-auto flex items-center gap-1 transition-colors ${
              prefs.showSecretsOnly ? 'bg-warning/30 text-warning' : 'bg-surface-600/50 text-gray-400 hover:text-white'
            }`}
          >
            <Shield size={10} />
            Secrets only
          </button>
        </div>
      )}

      {!prefs.showHidden && (
        <div className="px-3 py-2 border-b border-warning/30 bg-warning/10 flex items-center justify-between gap-2">
          <span className="text-xs text-warning flex items-center gap-1.5">
            <EyeOff size={14} /> Hidden files are off — click the <Eye size={12} className="inline" /> eye icon above to see `.env`
          </span>
          <button
            onClick={() => updatePrefs({ showHidden: true })}
            className="text-[10px] bg-warning/20 hover:bg-warning/30 text-warning px-2 py-1 rounded-lg shrink-0"
          >
            Show hidden
          </button>
        </div>
      )}

      {secretItems.length > 0 && !prefs.showSecretsOnly && prefs.showHidden && (
        <div className="px-3 py-2 border-b border-warning/20 bg-warning/5">
          <div className="text-[10px] text-warning uppercase mb-1.5 flex items-center gap-1">
            <Shield size={10} /> Config & secrets in this folder ({secretItems.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {secretItems.map((item) => (
              <button
                key={item.path}
                onClick={() => setOpenFile(item)}
                className="text-[10px] bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 px-2.5 py-1 rounded-lg font-mono transition-colors"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {secretItems.length === 0 && parentSecrets.length > 0 && (
        <div className="px-3 py-2 border-b border-warning/20 bg-warning/5">
          <div className="text-[10px] text-warning uppercase mb-1.5 flex items-center gap-1">
            <Shield size={10} /> Secrets in parent folders (not in this subfolder)
          </div>
          <div className="space-y-2">
            {parentSecrets.map(([folder, files]) => (
              <div key={folder} className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => navigate(folder)}
                  className="text-[10px] text-gray-400 hover:text-accent font-mono underline"
                >
                  {folder}
                </button>
                <span className="text-gray-600">→</span>
                {files.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => setOpenFile(item)}
                    className="text-[10px] bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 px-2 py-0.5 rounded font-mono"
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {secretItems.length === 0 && parentSecrets.length === 0 && prefs.showHidden && !loading && (
        <div className="px-3 py-1.5 border-b border-surface-600/20 text-[10px] text-gray-600">
          No `.env` here — usually in project root. Go up:{' '}
          <button onClick={goUp} className="text-accent hover:underline">parent folder ↑</button>
          {' '}or try <button onClick={() => navigate('/home/deploy/ISAM/iSAM')} className="text-accent hover:underline">/home/deploy/ISAM/iSAM</button>
        </div>
      )}

      {bookmarks.length > 0 && (
        <div className="px-3 py-2 border-b border-surface-600/30 flex gap-1.5 flex-wrap">
          {bookmarks.map((bm) => (
            <button
              key={bm.id}
              onClick={() => navigate(bm.path)}
              className="text-xs bg-surface-600/50 hover:bg-accent/20 hover:text-accent px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
            >
              <Star size={10} className="text-warning" />
              {bm.name}
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumbs + server status */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-600/30 min-h-[36px]">
        <div className="flex items-center gap-1 text-xs overflow-x-auto min-w-0 flex-1">
          <button onClick={() => navigate('/')} className="p-1 rounded hover:bg-surface-600 shrink-0">
            <Home size={14} className="text-gray-400" />
          </button>
          {currentPath !== '/' && (
            <button onClick={goUp} className="p-1 rounded hover:bg-surface-600 shrink-0">
              <ArrowUp size={14} className="text-gray-400" />
            </button>
          )}
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-accent shrink-0">/</button>
          {pathParts.map((part, i) => {
            const path = '/' + pathParts.slice(0, i + 1).join('/');
            return (
              <span key={path} className="flex items-center shrink-0">
                <button onClick={() => navigate(path)} className="text-gray-300 hover:text-accent">
                  {part}
                </button>
                {i < pathParts.length - 1 && <ChevronRight size={12} className="text-gray-600 mx-0.5" />}
              </span>
            );
          })}
        </div>
        {isProjectFolder && (
          <FolderServerStatusBadge
            running={activity.running}
            loading={activityLoading}
            compact={false}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 text-danger text-sm">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm text-center">
              {search || prefs.filterType !== 'all' ? 'No matching items' : 'Empty directory'}
            </div>
          ) : prefs.viewMode === 'list' ? (
            <div className="divide-y divide-surface-600/20">
              {filteredItems.map((item) => (
                <FileListItem
                  key={item.path}
                  item={item}
                  onOpen={navigate}
                  onFileOpen={setOpenFile}
                />
              ))}
            </div>
          ) : (
            <div className={`grid ${gridCfg.cols} ${gridCfg.gap} p-3`}>
              {filteredItems.map((item) => (
                <FileGridItem
                  key={item.path}
                  item={item}
                  gridSize={prefs.gridSize}
                  onOpen={navigate}
                  onFileOpen={setOpenFile}
                />
              ))}
            </div>
          )}
      </div>

      <FolderCommandDrawer
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        connectionId={connectionId}
        folderPath={currentPath}
        folderItems={items}
        onRunCommand={onRunCommand}
      />

      <FolderTerminalDrawer
        open={folderTerminalOpen}
        onClose={() => setFolderTerminalOpen(false)}
        connectionId={connectionId}
        folderPath={currentPath}
      />

      <GitTerminalDrawer
        open={gitTerminalOpen}
        onClose={() => setGitTerminalOpen(false)}
        connectionId={connectionId}
        folderPath={currentPath}
        gitInfo={gitInfo}
        gitLoading={gitLoading}
      />

      <FileEditor
        open={!!openFile}
        file={openFile}
        connectionId={connectionId}
        projectRoot={openFile ? deriveProjectRoot(openFile.path, currentPath) : currentPath}
        onBrowseFolder={(folderPath) => {
          navigate(folderPath);
        }}
        onClose={() => setOpenFile(null)}
      />
    </div>
  );
}
