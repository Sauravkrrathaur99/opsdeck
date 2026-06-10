import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play, Plus, Trash2, Terminal, Save, Loader2, Zap, X,
  Activity, ScrollText, RefreshCw, Radio, History,
} from 'lucide-react';
import { api } from '../api';
import { detectProject } from '../projectDetect';
import { useFolderActivity } from '../hooks/useFolderActivity';
import FolderServerStatusBadge from './FolderServerStatusBadge';

const SHORTCUT_COLORS = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
  default: 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25',
};

function normalizeLogCommand(raw) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const tailLog = (path) => `{ tail -n 100 ${path} 2>/dev/null || sudo -n tail -n 100 ${path}; }`;
  const aliases = {
    'nginx access.log': tailLog('/var/log/nginx/access.log'),
    'nginx access': tailLog('/var/log/nginx/access.log'),
    'nginx error.log': tailLog('/var/log/nginx/error.log'),
    'nginx error': tailLog('/var/log/nginx/error.log'),
    'access.log': tailLog('/var/log/nginx/access.log'),
    'gunicorn.log': tailLog('gunicorn.log'),
    'gunicorn-access.log': tailLog('gunicorn-access.log'),
    'gunicorn access': tailLog('gunicorn-access.log'),
  };
  if (aliases[lower]) return { command: aliases[lower], note: '→ tail with sudo fallback if permission denied' };
  if (/^nginx\s+access/i.test(trimmed)) {
    return { command: tailLog('/var/log/nginx/access.log'), note: '→ tail with sudo fallback' };
  }
  if (/^nginx\s+error/i.test(trimmed)) {
    return { command: tailLog('/var/log/nginx/error.log'), note: '→ tail with sudo fallback' };
  }
  if (/^tail\b/i.test(trimmed) && /permission denied/i.test(trimmed) === false) {
    const m = trimmed.match(/^tail\s+(?:-n\s+\d+\s+)?(.+)$/i);
    if (m?.[1]) {
      const path = m[1].trim();
      if (path.startsWith('/var/log/')) return { command: tailLog(path), note: '→ added sudo fallback' };
    }
  }
  return { command: trimmed, note: null };
}

export default function FolderCommandDrawer({
  open,
  onClose,
  connectionId,
  folderPath,
  folderItems,
  onRunCommand,
}) {
  const [commands, setCommands] = useState([]);
  const [runInput, setRunInput] = useState('');
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [running, setRunning] = useState(false);
  const [rightTab, setRightTab] = useState('output');
  const [outputText, setOutputText] = useState('');
  const [outputMeta, setOutputMeta] = useState(null);
  const [liveLogs, setLiveLogs] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [liveMode, setLiveMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const logEndRef = useRef(null);

  const project = useMemo(() => detectProject(folderItems || []), [folderItems]);
  const folderName = folderPath?.split('/').pop() || 'root';
  const { activity, loading: activityLoading, refresh: loadActivity } = useFolderActivity(
    connectionId,
    folderPath,
    { enabled: open, intervalMs: 10000 },
  );

  const loadCommands = async () => {
    if (!connectionId || !folderPath) return;
    try {
      setCommands(await api.folderCommands.list(connectionId, folderPath));
    } catch {
      setCommands([]);
    }
  };

  const loadHistory = async () => {
    if (!connectionId || !folderPath) return;
    try {
      setHistory(await api.commandHistory.list(connectionId, folderPath));
    } catch {
      setHistory([]);
    }
  };

  const saveToHistory = async (command, label, stdout, stderr, exit_code) => {
    try {
      await api.commandHistory.save({
        connection_id: connectionId,
        folder_path: folderPath,
        command,
        label: label || command,
        stdout: stdout || '',
        stderr: stderr || '',
        exit_code: exit_code ?? 0,
      });
      loadHistory();
    } catch {
      // ignore
    }
  };

  const viewHistory = (entry) => {
    setSelectedHistoryId(entry.id);
    const text = `${entry.stdout || ''}${entry.stderr ? `\n${entry.stderr}` : ''}` || '(no output)';
    setOutputText(text);
    setOutputMeta({
      label: entry.label || entry.command,
      code: entry.exit_code,
      time: new Date(entry.created_at).toLocaleString(),
      error: entry.exit_code !== 0,
    });
    setRightTab('output');
  };

  const pickLogSource = (item) => {
    if (!item) return null;
    if (item.logType && item.logTarget) return { type: item.logType, target: item.logTarget, name: item.name };
    return null;
  };

  useEffect(() => {
    if (!open) return;
    setSelectedLog((prev) => {
      const match = prev?.id ? activity.running.find((r) => r.id === prev.id) : null;
      return match || activity.running.find((r) => r.logType && r.logTarget) || prev;
    });
  }, [open, activity.running]);

  const fetchLiveLogs = useCallback(async (item) => {
    const source = pickLogSource(item);
    if (!connectionId || !source) {
      setLiveLogs('');
      return;
    }
    try {
      const isHttpAccess = /access\.log|gunicorn-access/i.test(source.target || '');
      const lineCount = isHttpAccess ? 300 : 200;
      const res = await api.processes.logs(
        connectionId, source.type, source.target, lineCount, isHttpAccess ? 'app' : undefined
      );
      setLiveLogs(res.logs || '(empty log file)');
    } catch (err) {
      setLiveLogs(`Error fetching logs: ${err.message}`);
    }
  }, [connectionId]);

  useEffect(() => {
    if (!open) return;
    api.connections.warmup(connectionId).catch(() => {});
    loadCommands();
    loadHistory();
  }, [open, connectionId, folderPath]);

  useEffect(() => {
    if (!open || !liveMode || !selectedLog?.logTarget) return;
    fetchLiveLogs(selectedLog);
    const interval = setInterval(() => fetchLiveLogs(selectedLog), 2500);
    return () => clearInterval(interval);
  }, [open, liveMode, selectedLog, fetchLiveLogs]);

  useEffect(() => {
    if (!open || rightTab !== 'live') return;
    if (!selectedLog && activity.running.length > 0) {
      const first = activity.running.find((r) => r.logType && r.logTarget);
      if (first) {
        setSelectedLog(first);
        setLiveMode(true);
      }
    }
  }, [open, rightTab, selectedLog, activity.running]);

  useEffect(() => {
    if (rightTab === 'live' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs, rightTab]);

  const showOutput = (label, stdout, stderr, code, error) => {
    const text = error || `${stdout || ''}${stderr ? `\n${stderr}` : ''}` || '(no output)';
    setOutputText(text);
    setOutputMeta({ label, code, time: new Date().toLocaleTimeString(), error: !!error || code > 0 });
    setRightTab('output');
  };

  const executeCommand = async (command, label) => {
    if (!command?.trim()) return;
    const { command: resolved, note } = normalizeLogCommand(command);
    setRunning(true);
    setRightTab('output');
    setOutputText(`$ cd ${folderPath}\n$ ${command}${note ? `\n${note}` : ''}\n\nRunning...`);
    setOutputMeta({ label: label || command, time: new Date().toLocaleTimeString() });

    const isLongRunning = /runserver|npm run dev|pm2 start|tail -f|watch/i.test(resolved);

    if (isLongRunning) {
      onRunCommand?.(`cd "${folderPath}" && ${resolved}`);
      const msg = '→ Long-running command sent to Terminal tab.\nWatch Live Logs for gunicorn.log / PM2 output.';
      showOutput(label || command, msg, '', 0);
      await saveToHistory(resolved, label, msg, '', 0);
      setRunning(false);
      setLiveMode(true);
      setRightTab('live');
      return;
    }

    try {
      const result = await api.folderCommands.run(connectionId, folderPath, resolved, label || command);
      showOutput(label || command, result.stdout, result.stderr, result.code);
      loadHistory();
      loadActivity();
    } catch (err) {
      showOutput(label || command, '', '', 1, err.message);
      loadHistory();
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim() || !runInput.trim()) return;
    await api.folderCommands.create({
      name: saveName.trim(),
      command: runInput.trim(),
      folder_path: folderPath,
      connection_id: connectionId,
    });
    setSaveName('');
    setShowSave(false);
    loadCommands();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[min(920px,82vw)] bg-surface-800 border-l border-surface-600/50 flex flex-col shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600/50 bg-surface-700/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Terminal size={16} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Folder Console</h2>
              <p className="text-[10px] text-gray-500 font-mono truncate">{folderPath}</p>
            </div>
            <span className="text-[10px] bg-surface-600 px-2 py-0.5 rounded-full text-gray-400 shrink-0">
              {project.label}
            </span>
            <FolderServerStatusBadge running={activity.running} loading={activityLoading} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* LEFT — commands */}
          <div className="w-[340px] shrink-0 border-r border-surface-600/40 flex flex-col min-h-0">
            <div className="p-3 border-b border-surface-600/30 shrink-0">
              <div className="text-[10px] text-gray-500 uppercase mb-2">Smart Shortcuts</div>
              <div className="flex flex-wrap gap-1.5">
                {project.shortcuts.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => executeCommand(s.command, s.label)}
                    disabled={running}
                    title={s.command}
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                      SHORTCUT_COLORS[s.color] || SHORTCUT_COLORS.default
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-600 mt-2 font-mono truncate" title={project.shortcuts.find((s) => s.id === 'check')?.command}>
                e.g. {project.shortcuts.find((s) => s.id === 'check')?.command || project.shortcuts[0]?.command}
              </p>
            </div>

            <div className="p-3 border-b border-surface-600/30 shrink-0">
              <div className="flex gap-1">
                <input
                  className="input-field text-xs font-mono flex-1 py-2"
                  placeholder="Type command..."
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runInput.trim() && executeCommand(runInput.trim())}
                />
                <button
                  onClick={() => runInput.trim() && executeCommand(runInput.trim())}
                  disabled={!runInput.trim() || running}
                  className="w-9 h-9 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center disabled:opacity-40"
                >
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                </button>
              </div>
              <button onClick={() => setShowSave(!showSave)} className="text-[10px] text-gray-400 hover:text-accent mt-2 flex items-center gap-1">
                <Save size={10} /> Save command
              </button>
              {showSave && (
                <div className="flex gap-1 mt-2">
                  <input className="input-field text-xs flex-1 py-1" placeholder="Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                  <button onClick={handleSave} className="btn-primary text-[10px] py-1 px-2"><Plus size={12} /></button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 min-h-0">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap size={12} className="text-warning" />
                <span className="text-[10px] font-medium text-gray-500 uppercase">Saved · {folderName}</span>
              </div>
              {commands.length === 0 ? (
                <p className="text-[10px] text-gray-600">No saved commands</p>
              ) : (
                <div className="space-y-1">
                  {commands.map((cmd) => (
                    <div key={cmd.id} className="group flex items-center gap-2 p-2 rounded-lg bg-surface-700/30 hover:bg-surface-700/50">
                      <button onClick={() => executeCommand(cmd.command, cmd.name)} className="w-7 h-7 rounded bg-accent/20 hover:bg-accent text-accent hover:text-white flex items-center justify-center shrink-0">
                        <Play size={11} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{cmd.name}</div>
                        <div className="text-[9px] text-gray-500 font-mono truncate">{cmd.command}</div>
                      </div>
                      <button onClick={() => api.folderCommands.delete(cmd.id).then(loadCommands)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-danger">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-surface-600/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <History size={12} className="text-accent" />
                  <span className="text-[10px] font-medium text-gray-500 uppercase">History ({history.length})</span>
                </div>
                {history.length === 0 ? (
                  <p className="text-[10px] text-gray-600 mb-3">Runs are saved automatically</p>
                ) : (
                  <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => viewHistory(entry)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                          selectedHistoryId === entry.id ? 'bg-accent/20 border border-accent/30' : 'bg-surface-700/30 hover:bg-surface-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.exit_code === 0 ? 'bg-success' : 'bg-danger'}`} />
                          <span className="font-mono truncate flex-1 text-[10px]">{entry.command}</span>
                        </div>
                        <div className="text-[9px] text-gray-600 mt-0.5 pl-3">
                          {new Date(entry.created_at).toLocaleString()} · exit {entry.exit_code}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-surface-600/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Activity size={12} className="text-success" />
                    <span className="text-[10px] font-medium text-gray-500 uppercase">Running ({activity.running.length})</span>
                  </div>
                  <button onClick={loadActivity} className="p-1 hover:bg-surface-600 rounded">
                    <RefreshCw size={11} className="text-gray-500" />
                  </button>
                </div>
                {activity.running.length === 0 ? (
                  <p className="text-[10px] text-gray-600">
                    No log sources found. Use <span className="text-emerald-400">Nginx Access</span> shortcut or tail command.
                  </p>
                ) : (
                  activity.running.map((app) => {
                    const hasLogs = !!(app.logType && app.logTarget);
                    const isActive = selectedLog?.id === app.id;
                    const statusColor =
                      app.status === 'online' || app.status === 'running'
                        ? 'bg-success animate-pulse'
                        : app.status === 'log'
                          ? 'bg-accent'
                          : 'bg-danger';
                    return (
                      <button
                        key={app.id || app.name}
                        onClick={() => {
                          setSelectedLog(app);
                          setLiveMode(true);
                          setRightTab('live');
                          if (hasLogs) fetchLiveLogs(app);
                          else setLiveLogs('No log file linked to this process. Check gunicorn.log in this folder.');
                        }}
                        disabled={!hasLogs}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg mb-1 text-left text-xs ${
                          isActive ? 'bg-accent/20 border border-accent/30' : 'bg-surface-700/30 hover:bg-surface-700/50'
                        } ${!hasLogs ? 'opacity-60' : ''}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{app.name}</div>
                          <div className="text-[9px] text-gray-500">
                            {app.type === 'pm2' ? 'PM2' : app.type === 'logfile' ? 'log file' : 'background'}
                            {app.status && app.type !== 'logfile' ? ` · ${app.status}` : ''}
                            {app.port ? ` · :${app.port}` : ''}
                            {app.hint ? ` · ${app.hint}` : ''}
                          </div>
                        </div>
                        {hasLogs && <Radio size={11} className="text-gray-500 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — output / live logs */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-600/40 shrink-0">
              <button
                onClick={() => setRightTab('output')}
                className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${rightTab === 'output' ? 'bg-accent text-white' : 'text-gray-400 hover:bg-surface-600'}`}
              >
                <ScrollText size={13} /> Output
              </button>
              <button
                onClick={() => {
                  setRightTab('live');
                  setLiveMode(true);
                  const target = selectedLog || activity.running.find((r) => r.logType && r.logTarget);
                  if (target) {
                    setSelectedLog(target);
                    fetchLiveLogs(target);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${rightTab === 'live' ? 'bg-success/20 text-success' : 'text-gray-400 hover:bg-surface-600'}`}
              >
                <Radio size={13} /> Live Logs
                {liveMode && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
              </button>
              {outputMeta && rightTab === 'output' && (
                <span className="text-[10px] text-gray-500 ml-auto">
                  {outputMeta.label} · {outputMeta.time}
                  {outputMeta.code !== undefined && ` · exit ${outputMeta.code}`}
                </span>
              )}
              {rightTab === 'live' && selectedLog && (
                <span className="text-[10px] text-gray-500 ml-auto truncate max-w-[200px]">
                  {selectedLog.name} · refresh 4s
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-surface-900/60 min-h-0">
              {rightTab === 'output' ? (
                outputText ? (
                  <pre className={`text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${outputMeta?.error ? 'text-danger' : 'text-gray-300'}`}>
                    {outputText}
                  </pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                    Run a command or shortcut — full output shows here
                  </div>
                )
              ) : (
                <div>
                  {!selectedLog?.logTarget ? (
                    <p className="text-sm text-gray-600 text-center mt-8">
                      {activity.running.length === 0
                        ? 'No gunicorn.log or background servers found in this folder. Click Refresh.'
                        : 'Select a running app or log file from the left'}
                    </p>
                  ) : (
                    <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all leading-relaxed">
                      {liveLogs || 'Waiting for logs...'}
                    </pre>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
