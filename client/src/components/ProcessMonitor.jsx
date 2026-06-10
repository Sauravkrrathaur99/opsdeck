import { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, Loader2, Server, Container,
  Network, ScrollText, ChevronDown, ChevronRight,
} from 'lucide-react';
import { api } from '../api';

function StatusBadge({ status }) {
  const colors = {
    online: 'bg-success/20 text-success',
    running: 'bg-success/20 text-success',
    stopped: 'bg-danger/20 text-danger',
    errored: 'bg-danger/20 text-danger',
  };
  const cls = colors[status?.toLowerCase()] || 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>{status}</span>
  );
}

function formatMem(bytes) {
  if (!bytes) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProcessMonitor({ connectionId, connectionName }) {
  const [data, setData] = useState({ pm2: [], docker: [], ports: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [expanded, setExpanded] = useState({ pm2: true, docker: true, ports: true, terminal: true });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchProcesses = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.processes.list(connectionId);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchProcesses, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchProcesses]);

  const fetchLogs = async (type, target, label) => {
    setSelectedLog({ type, target, label });
    setLogLoading(true);
    setLogContent('');
    try {
      const result = await api.processes.logs(connectionId, type, target);
      setLogContent(result.logs || '(empty)');
    } catch (err) {
      setLogContent(`Error: ${err.message}`);
    } finally {
      setLogLoading(false);
    }
  };

  const terminalLogs = window.__opsdeckTerminalLogs?.[connectionId] || [];
  const recentTerminal = terminalLogs.slice(-200).map((e) => e.data).join('');

  const toggle = (section) => setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  if (!connectionId) {
    return (
      <div className="card h-full flex items-center justify-center text-gray-500 text-sm">
        Select a VPS connection
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600/50 bg-surface-700/30">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-success" />
          <span className="font-medium text-sm">Running Services</span>
          {connectionName && (
            <span className="text-xs text-gray-500 bg-surface-600 px-2 py-0.5 rounded-full">{connectionName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchProcesses}
            className="p-1.5 rounded-lg hover:bg-surface-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <div className="text-danger text-sm p-2 bg-danger/10 rounded-lg">{error}</div>}

          {/* PM2 */}
          <section>
            <button onClick={() => toggle('pm2')} className="flex items-center gap-2 w-full text-left mb-2">
              {expanded.pm2 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Server size={14} className="text-accent" />
              <span className="text-xs font-medium text-gray-400 uppercase">PM2 Apps ({data.pm2.length})</span>
            </button>
            {expanded.pm2 && (
              <div className="space-y-1">
                {data.pm2.length === 0 ? (
                  <p className="text-xs text-gray-600 pl-6">No PM2 processes</p>
                ) : data.pm2.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => fetchLogs('pm2', app.name, `PM2: ${app.name}`)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                      selectedLog?.target === app.name ? 'bg-accent/20 border border-accent/30' : 'bg-surface-700/30 hover:bg-surface-700/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{app.name}</span>
                        <StatusBadge status={app.status} />
                        {app.port && (
                          <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded font-mono">
                            :{app.port}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                        {app.cwd} · CPU {app.cpu}% · {formatMem(app.memory)}
                      </div>
                    </div>
                    <ScrollText size={14} className="text-gray-500 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Docker */}
          <section>
            <button onClick={() => toggle('docker')} className="flex items-center gap-2 w-full text-left mb-2">
              {expanded.docker ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Container size={14} className="text-cyan-400" />
              <span className="text-xs font-medium text-gray-400 uppercase">Docker ({data.docker.length})</span>
            </button>
            {expanded.docker && (
              <div className="space-y-1">
                {data.docker.length === 0 ? (
                  <p className="text-xs text-gray-600 pl-6">No running containers</p>
                ) : data.docker.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => fetchLogs('docker', c.name, `Docker: ${c.name}`)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                      selectedLog?.target === c.name ? 'bg-accent/20 border border-accent/30' : 'bg-surface-700/30 hover:bg-surface-700/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.name}</span>
                        <StatusBadge status={c.status?.split(' ')[0]} />
                        {c.port && (
                          <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded font-mono">
                            :{c.port}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono truncate">{c.ports}</div>
                    </div>
                    <ScrollText size={14} className="text-gray-500 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Ports */}
          <section>
            <button onClick={() => toggle('ports')} className="flex items-center gap-2 w-full text-left mb-2">
              {expanded.ports ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Network size={14} className="text-warning" />
              <span className="text-xs font-medium text-gray-400 uppercase">Listening Ports ({data.ports.length})</span>
            </button>
            {expanded.ports && (
              <div className="grid grid-cols-2 gap-1">
                {data.ports.length === 0 ? (
                  <p className="text-xs text-gray-600 pl-6 col-span-2">No listening ports found</p>
                ) : data.ports.map((p) => (
                  <div key={p.port} className="flex items-center gap-2 p-2 rounded-lg bg-surface-700/30 text-xs">
                    <span className="font-mono text-accent font-medium shrink-0">:{p.port}</span>
                    <span className={`truncate flex-1 ${p.process === 'unknown' ? 'text-gray-600' : 'text-gray-300'}`}>
                      {p.process}
                    </span>
                    {p.source && p.source !== 'unknown' && (
                      <span className="text-[9px] text-gray-600 shrink-0 uppercase">{p.source}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Terminal capture */}
          <section>
            <button onClick={() => toggle('terminal')} className="flex items-center gap-2 w-full text-left mb-2">
              {expanded.terminal ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <ScrollText size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-400 uppercase">Terminal Output</span>
            </button>
            {expanded.terminal && (
              <button
                onClick={() => {
                  setSelectedLog({ type: 'terminal', target: 'live', label: 'Terminal Output' });
                  setLogContent(recentTerminal || '(no terminal output yet — open Terminal tab first)');
                }}
                className="w-full p-2.5 rounded-lg bg-surface-700/30 hover:bg-surface-700/60 text-left text-xs text-gray-400"
              >
                View captured terminal logs ({terminalLogs.length} lines)
              </button>
            )}
          </section>
        </div>

        {/* Log viewer panel */}
        <div className="w-[45%] shrink-0 border-l border-surface-600/40 flex flex-col bg-surface-900/50">
          <div className="px-3 py-2 border-b border-surface-600/40 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-300">
              {selectedLog ? selectedLog.label : 'Select a service to view logs'}
            </span>
            {selectedLog && selectedLog.type === 'pm2' && (
              <button
                onClick={() => fetchLogs('pm2', selectedLog.target, selectedLog.label)}
                className="text-[10px] text-accent hover:underline"
              >
                Refresh
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {logLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-500" />
              </div>
            ) : selectedLog ? (
              <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed">
                {logContent}
              </pre>
            ) : (
              <p className="text-xs text-gray-600 text-center py-8">
                Click any PM2 app, Docker container, or Terminal Output to view logs here
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
