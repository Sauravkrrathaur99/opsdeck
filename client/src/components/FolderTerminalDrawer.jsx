import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, RefreshCw } from 'lucide-react';
import { api } from '../api';
import TerminalPane from './TerminalPane';

export default function FolderTerminalDrawer({
  open,
  onClose,
  connectionId,
  folderPath,
}) {
  const [everOpened, setEverOpened] = useState(false);
  const terminalActionsRef = useRef(null);
  const warmedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setEverOpened(true);
    if (!warmedRef.current) {
      warmedRef.current = true;
      api.connections.warmup(connectionId).catch(() => {});
    }
  }, [open, connectionId]);

  if (!everOpened || !connectionId) return null;

  const folderName = folderPath?.split('/').filter(Boolean).pop() || 'root';
  const sessionId = `folder-${folderPath}`;

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
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TerminalIcon size={16} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Folder Terminal</h2>
              <p className="text-[10px] text-gray-500 font-mono truncate">{folderPath}</p>
            </div>
            <span className="text-[10px] bg-surface-600 px-2 py-0.5 rounded-full text-gray-400 shrink-0">
              {folderName}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            <button
              onClick={() => terminalActionsRef.current?.reconnect?.()}
              className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-emerald-400"
              title="Reconnect now"
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-2">
          <div className="h-full min-h-[320px] rounded-lg border border-surface-600/50 overflow-hidden bg-surface-900">
            <TerminalPane
              connectionId={connectionId}
              sessionId={sessionId}
              initialPath={folderPath}
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
