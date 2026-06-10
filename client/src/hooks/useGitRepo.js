import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';

const EMPTY_GIT = {
  isRepo: false,
  root: null,
  branch: null,
  statusLine: null,
  dirty: false,
  changedFiles: 0,
};

function findDotGitRoot(folderPath, listingItems) {
  if (!folderPath || !listingItems?.length) return null;
  if (listingItems.some((item) => item.name === '.git')) return folderPath;
  return null;
}

function mergeGitInfo(serverInfo, listingRoot) {
  if (serverInfo.isRepo && serverInfo.root) return serverInfo;
  if (listingRoot) {
    return {
      ...serverInfo,
      isRepo: true,
      root: listingRoot,
      fromListing: true,
    };
  }
  return serverInfo;
}

export function useGitRepo(connectionId, folderPath, listingItems = []) {
  const [serverGitInfo, setServerGitInfo] = useState(EMPTY_GIT);
  const [loading, setLoading] = useState(false);

  const listingRoot = useMemo(
    () => findDotGitRoot(folderPath, listingItems),
    [folderPath, listingItems]
  );

  const gitInfo = useMemo(
    () => mergeGitInfo(serverGitInfo, listingRoot),
    [serverGitInfo, listingRoot]
  );

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!connectionId || !folderPath) {
      setServerGitInfo(EMPTY_GIT);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const hasDotGit = listingItems.some((item) => item.name === '.git');
      const data = await api.files.gitInfo(connectionId, folderPath, { hasDotGit });
      setServerGitInfo({
        isRepo: !!data.isRepo,
        root: data.root || null,
        branch: data.branch || null,
        statusLine: data.statusLine || null,
        dirty: !!data.dirty,
        changedFiles: data.changedFiles || 0,
      });
    } catch {
      if (!listingRoot) setServerGitInfo(EMPTY_GIT);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [connectionId, folderPath, listingItems, listingRoot]);

  useEffect(() => {
    refresh({ silent: !!listingRoot });
  }, [refresh, listingRoot]);

  return { gitInfo, loading, refresh };
}
