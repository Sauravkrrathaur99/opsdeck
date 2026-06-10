const KEY = 'opsdeck-explorer-prefs';

const DEFAULTS = {
  viewMode: 'list',
  gridSize: 'medium',
  filterType: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
  showHidden: true,
  showSecretsOnly: false,
};

export function loadExplorerPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveExplorerPrefs(updates) {
  const prefs = { ...loadExplorerPrefs(), ...updates };
  localStorage.setItem(KEY, JSON.stringify(prefs));
  return prefs;
}
