import { useState, useEffect } from 'react';
import { Folder, ChevronDown, ChevronRight, Loader2, Home } from 'lucide-react';
import { api } from '../api';
import { getFileCache, setFileCache } from '../fileCache';

export default function DeployFolders({ connection, onOpenFolder }) {
  const [expanded, setExpanded] = useState(true);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const homePath = connection?.username ? `/home/${connection.username}` : '/home/deploy';
  const cacheKey = `${connection?.id}:${homePath}:dirs`;

  useEffect(() => {
    if (!connection?.id) return;

    const cached = getFileCache(cacheKey);
    if (cached) {
      setFolders(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    let cancelled = false;

    api.files.listDirs(connection.id, homePath)
      .then((data) => {
        if (cancelled) return;
        const dirs = data.items.filter((item) => item.type === 'directory');
        setFolders(dirs);
        setFileCache(cacheKey, dirs);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!cached) {
          setError(err.message);
          setFolders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [connection?.id, homePath, cacheKey]);

  if (!connection) return null;

  return (
    <div className="mt-4 pt-4 border-t border-surface-600/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-300"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="truncate">/{connection.username}</span>
        {loading && folders.length > 0 && (
          <Loader2 size={10} className="animate-spin text-gray-600 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="space-y-0.5 pl-1">
          <button
            onClick={() => onOpenFolder(homePath)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-accent hover:bg-surface-700/50 transition-colors text-left"
          >
            <Home size={13} />
            <span>home</span>
          </button>

          {loading && folders.length === 0 && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </div>
          )}

          {error && folders.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-danger">{error}</p>
          )}

          {folders.map((folder) => (
            <button
              key={folder.path}
              onClick={() => onOpenFolder(folder.path)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-300 hover:text-accent hover:bg-surface-700/50 transition-colors text-left group"
            >
              <Folder size={13} className="text-accent/70 group-hover:text-accent shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}

          {!loading && !error && folders.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-gray-600">No folders found</p>
          )}
        </div>
      )}
    </div>
  );
}
