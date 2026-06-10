import { useState, useEffect, useRef } from 'react';
import { GitBranch, X, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { clearTerminalHistory } from '../terminalHistory';
import TerminalPane from './TerminalPane';

export default function GitTerminalDrawer({
  open,
  onClose,
  connectionId,
  folderPath,
  gitInfo,
  gitLoading,
}) {
  const [everOpened, setEverOpened] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const terminalActionsRef = useRef(null);
  const warmedRef = useRef(false);

  const isRepo = gitInfo?.isRepo && gitInfo?.root;
  const terminalPath = isRepo ? gitInfo.root : folderPath;
  const sessionId = `git-${terminalPath}`;

  useEffect(() => {
    if (!open) return;
    setEverOpened(true);
    if (!warmedRef.current) {
      warmedRef.current = true;
      api.connections.warmup(connectionId).catch(() => {});
    }
  }, [open, connectionId]);

  const handleClearSession = () => {
    if (!connectionId || !sessionId) return;
    clearTerminalHistory(connectionId, sessionId);
    setSessionKey((k) => k + 1);
  };

  if (!everOpened || !connectionId) return null;

  const branchLabel = gitInfo?.branch;
  const inSubfolder = isRepo && folderPath !== gitInfo.root;

  return (
    <div className={`fixed inset-0 z-50 flex ${open ? '' : 'pointer-events-none invisible'}`}>
      <div
        className={`flex-1 bg-black/40 backdrop-blur-[2px] transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`w-[min(720px,58vw)] bg-surface-800 border-l border-surface-600/50 flex flex-col shadow-2xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600/50 bg-surface-700/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <GitBranch size={16} className="text-orange-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Git Bash</h2>
              <p className="text-[10px] text-gray-500 font-mono truncate">{terminalPath}</p>
            </div>
            {isRepo && branchLabel && (
              <span className="text-[10px] bg-orange-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full shrink-0 font-mono">
                ({branchLabel}){gitInfo.dirty ? ' •' : ''}
              </span>
            )}
            {isRepo && !branchLabel && !gitLoading && (
              <span className="text-[10px] bg-surface-600 text-gray-400 px-2 py-0.5 rounded-full shrink-0">
                git repo
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            <button
              onClick={() => terminalActionsRef.current?.reconnect?.()}
              className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-orange-400"
              title="Reconnect now"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleClearSession}
              className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-danger"
              title="Clear saved terminal history"
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {isRepo ? (
          <div className="px-4 py-2 border-b border-surface-600/30 bg-surface-900/40 flex flex-wrap items-center gap-2 text-[10px]">
            {gitInfo.statusLine && (
              <span className="font-mono text-gray-400">{gitInfo.statusLine}</span>
            )}
            {gitInfo.dirty && (
              <span className="text-warning">
                {gitInfo.changedFiles} changed file{gitInfo.changedFiles === 1 ? '' : 's'}
              </span>
            )}
            {inSubfolder && (
              <span className="text-gray-500">Opens at repo root</span>
            )}
            <span className="text-gray-600 ml-auto">Session saved until you clear</span>
          </div>
        ) : !gitLoading && !gitInfo.isRepo && (
          <div className="px-4 py-2 border-b border-warning/20 bg-warning/5 flex items-start gap-2 text-[10px] text-warning/90">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>
              No <code className="text-warning">.git</code> found in this folder or parents.
              Terminal still opens — run <code className="text-warning">git pull</code>,{' '}
              <code className="text-warning">git push</code>, etc. manually.
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 p-2">
          <div className="h-full min-h-[320px] rounded-lg border border-surface-600/50 overflow-hidden bg-[#0c0c0c]">
            <TerminalPane
              key={sessionKey}
              connectionId={connectionId}
              sessionId={sessionId}
              initialPath={terminalPath}
              terminalMode="git"
              compact
              maxReconnects={12}
              persistWhenHidden
              visible={open}
              onRegisterActions={(actions) => {
                terminalActionsRef.current = actions;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
