import { useState, useCallback, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Plus, X, Wifi, WifiOff, Loader2 } from 'lucide-react';
import TerminalPane from './TerminalPane';
import { getSession, saveSession } from '../sessionStorage';

const MAX_TERMINALS = 10;

function defaultSessions() {
  return [{ id: 't1', label: 'Terminal 1' }];
}

function loadTerminalState(connectionId) {
  const session = getSession(connectionId);
  const list = session.terminalSessions;
  if (Array.isArray(list) && list.length > 0) {
    const activeId = list.some((t) => t.id === session.activeTerminalId)
      ? session.activeTerminalId
      : list[0].id;
    return { sessions: list, activeId };
  }
  return { sessions: defaultSessions(), activeId: 't1' };
}

const STATUS_DOT = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-gray-500',
  error: 'bg-danger',
};

const MAX_LABEL_LEN = 32;

function nextTerminalLabel(sessions) {
  const used = new Set(
    sessions.map((s) => s.label).filter((l) => /^Terminal \d+$/.test(l)).map((l) => parseInt(l.replace('Terminal ', ''), 10))
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `Terminal ${n}`;
}

export default function TerminalWorkspace({ connectionId, connectionName, visible = true }) {
  const [{ sessions, activeId }, setState] = useState(() => loadTerminalState(connectionId));
  const [statuses, setStatuses] = useState({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);

  useEffect(() => {
    setState(loadTerminalState(connectionId));
    setStatuses({});
    setRenamingId(null);
  }, [connectionId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const persist = useCallback((nextSessions, nextActiveId) => {
    saveSession(connectionId, {
      terminalSessions: nextSessions,
      activeTerminalId: nextActiveId,
    });
  }, [connectionId]);

  const handleStatusChange = useCallback((sessionId, st) => {
    setStatuses((prev) => ({ ...prev, [sessionId]: st }));
  }, []);

  const addTerminal = () => {
    if (sessions.length >= MAX_TERMINALS) return;
    const id = `t${Date.now()}`;
    const label = nextTerminalLabel(sessions);
    const next = [...sessions, { id, label }];
    setState({ sessions: next, activeId: id });
    persist(next, id);
  };

  const commitRename = (id, raw) => {
    const label = raw.trim().slice(0, MAX_LABEL_LEN) || sessions.find((s) => s.id === id)?.label || 'Terminal';
    const next = sessions.map((s) => (s.id === id ? { ...s, label } : s));
    setState((prev) => ({ ...prev, sessions: next }));
    persist(next, activeId);
    setRenamingId(null);
  };

  const startRename = (id) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    setRenamingId(id);
    setRenameValue(session.label);
  };

  const closeTerminal = (id) => {
    if (sessions.length <= 1) return;
    const idx = sessions.findIndex((s) => s.id === id);
    const next = sessions.filter((s) => s.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      nextActive = next[Math.max(0, idx - 1)]?.id || next[0].id;
    }
    setState({ sessions: next, activeId: nextActive });
    persist(next, nextActive);
    setStatuses((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const selectTerminal = (id) => {
    setState((prev) => ({ ...prev, activeId: id }));
    persist(sessions, id);
  };

  const activeStatus = statuses[activeId] || 'connecting';
  const StatusIcon = activeStatus === 'connected'
    ? Wifi
    : activeStatus === 'connecting' || activeStatus === 'reconnecting'
      ? Loader2
      : WifiOff;

  const statusLabel = {
    connected: 'Connected',
    connecting: 'Connecting',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected',
    error: 'Error',
  }[activeStatus] || activeStatus;

  const statusColor = {
    connected: 'text-success',
    connecting: 'text-warning',
    reconnecting: 'text-warning',
    disconnected: 'text-gray-500',
    error: 'text-danger',
  }[activeStatus] || 'text-gray-500';

  return (
    <div className="card flex flex-col h-full overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-600/50 bg-surface-700/30 shrink-0">
        <TerminalIcon size={16} className="text-accent shrink-0" />
        <span className="text-sm font-medium shrink-0">Terminal</span>
        {connectionName && (
          <span className="text-[10px] text-gray-400 bg-surface-600 px-2 py-0.5 rounded-full shrink-0">
            {connectionName}
          </span>
        )}

        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto mx-1">
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            const isRenaming = renamingId === s.id;
            const dot = STATUS_DOT[statuses[s.id]] || STATUS_DOT.connecting;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1 shrink-0 rounded-md text-xs transition-all ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'bg-surface-600/50 text-gray-400 hover:bg-surface-600 hover:text-gray-200'
                }`}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="w-24 min-w-0 mx-1.5 my-1 px-1.5 py-0.5 rounded text-xs bg-surface-900 text-white border border-accent/50 outline-none"
                    value={renameValue}
                    maxLength={MAX_LABEL_LEN}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s.id, renameValue);
                      if (e.key === 'Escape') setRenamingId(null);
                      e.stopPropagation();
                    }}
                    onBlur={() => commitRename(s.id, renameValue)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    onClick={() => selectTerminal(s.id)}
                    onDoubleClick={(e) => { e.preventDefault(); startRename(s.id); }}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 max-w-[140px]"
                    title="Double-click to rename"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/80' : dot}`} />
                    <span className="truncate">{s.label}</span>
                  </button>
                )}
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTerminal(s.id); }}
                    className={`p-1 mr-0.5 rounded hover:bg-black/20 ${isActive ? 'text-white/70 hover:text-white' : 'text-gray-500'}`}
                    title="Close terminal"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={addTerminal}
            disabled={sessions.length >= MAX_TERMINALS}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-accent hover:bg-surface-600/50 disabled:opacity-30 shrink-0"
            title={sessions.length >= MAX_TERMINALS ? `Max ${MAX_TERMINALS} terminals` : 'New terminal'}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>

        <div className={`flex items-center gap-1.5 text-xs shrink-0 ${statusColor}`}>
          <StatusIcon size={13} className={activeStatus === 'reconnecting' || activeStatus === 'connecting' ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`absolute inset-0 ${s.id === activeId && visible ? '' : 'hidden'}`}
          >
            <TerminalPane
              connectionId={connectionId}
              sessionId={s.id}
              visible={s.id === activeId && visible}
              onStatusChange={handleStatusChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
