import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useFolderActivity(connectionId, folderPath, { enabled = true, intervalMs = 12000 } = {}) {
  const [activity, setActivity] = useState({ running: [], logFiles: [] });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!connectionId || !folderPath) {
      setActivity({ running: [], logFiles: [] });
      return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await api.folderActivity.get(connectionId, folderPath);
      setActivity(data);
    } catch {
      if (!silent) setActivity({ running: [], logFiles: [] });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [connectionId, folderPath]);

  useEffect(() => {
    if (!enabled || !connectionId || !folderPath) return;
    refresh();
    const timer = setInterval(() => refresh({ silent: true }), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, connectionId, folderPath, intervalMs, refresh]);

  return { activity, loading, refresh };
}
