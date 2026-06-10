import { useEffect, useRef, useCallback, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getSessionToken } from '../auth';
import { notifyUnauthorized } from '../api';
import { loadTerminalHistory, saveTerminalHistory } from '../terminalHistory';

const PING_INTERVAL = 20000;
const WS_OPEN_TIMEOUT_MS = 8000;
const SAVE_DEBOUNCE_MS = 600;
const PERMANENT_TERMINAL_ERRORS = /could not be decrypted|no ssh key provided|connection not found|unauthorized|login required|authentication methods failed|authentication failed|access denied|host key verification failed/i;
const TRANSIENT_TERMINAL_ERRORS = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|connection reset|network|broken pipe|EPIPE|aborted|websocket|closed before/i;
const GIT_STALE_HISTORY = /Welcome to Ubuntu|&& pwd|Last login:|System information as of/i;

const GIT_BASH_THEME = {
  background: '#0c0c0c',
  foreground: '#cccccc',
  cursor: '#ffffff',
  selectionBackground: '#ffffff40',
  black: '#0c0c0c',
  red: '#c50f1f',
  green: '#16c60c',
  yellow: '#c19c00',
  blue: '#0037da',
  magenta: '#881798',
  cyan: '#3a96dd',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#e74856',
  brightGreen: '#16c60c',
  brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff',
  brightMagenta: '#b4009e',
  brightCyan: '#61d6d6',
  brightWhite: '#f2f2f2',
};

const DEFAULT_THEME = {
  background: '#0a0e17',
  foreground: '#e2e8f0',
  cursor: '#3b82f6',
  selectionBackground: '#3b82f640',
  black: '#1e293b',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#64748b',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};

export default function TerminalPane({
  connectionId,
  sessionId,
  initialPath,
  terminalMode,
  visible = true,
  compact = false,
  maxReconnects = 4,
  persistWhenHidden = false,
  onStatusChange,
  onRegisterActions,
}) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const pingRef = useRef(null);
  const reconnectRef = useRef(null);
  const openTimeoutRef = useRef(null);
  const saveTimerRef = useRef(null);
  const disposedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const connectingRef = useRef(false);
  const bannerClearedRef = useRef(false);
  const bufferRef = useRef('');
  const awaitingProjectRef = useRef(false);
  const connectWsRef = useRef(null);
  const reconnectNowRef = useRef(null);
  const [reconnectBanner, setReconnectBanner] = useState({ show: false, message: '' });

  const setStatusSafe = useCallback((next) => {
    onStatusChange?.(sessionId, next);
  }, [onStatusChange, sessionId]);

  const enableTerminalInput = useCallback((term) => {
    if (!term) return;
    term.options.cursorBlink = true;
    term.options.disableStdin = false;
    awaitingProjectRef.current = false;
  }, []);

  const clearTimers = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(() => {
    if (!connectionId || !sessionId) return;
    saveTerminalHistory(connectionId, sessionId, bufferRef.current, { initialPath });
  }, [connectionId, sessionId, initialPath]);

  const schedulePersist = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persistNow, SAVE_DEBOUNCE_MS);
  }, [persistNow]);

  const appendOutput = useCallback((text) => {
    bufferRef.current += text;
    if (bufferRef.current.length > 500_000) {
      bufferRef.current = bufferRef.current.slice(-400_000);
    }
    schedulePersist();

    if (!window.__opsdeckTerminalLogs) window.__opsdeckTerminalLogs = {};
    const key = `${connectionId}:${sessionId}`;
    if (!window.__opsdeckTerminalLogs[key]) window.__opsdeckTerminalLogs[key] = [];
    const logs = window.__opsdeckTerminalLogs[key];
    logs.push({ time: Date.now(), data: text });
    if (logs.length > 5000) logs.splice(0, logs.length - 5000);
  }, [connectionId, sessionId, schedulePersist]);

  const stopReconnecting = useCallback((nextStatus = 'error') => {
    disposedRef.current = true;
    clearTimers();
    connectingRef.current = false;
    persistNow();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (nextStatus) setStatusSafe(nextStatus);
  }, [clearTimers, persistNow, setStatusSafe]);

  const clearBanner = useCallback((term) => {
    if (bannerClearedRef.current || !term) return;
    bannerClearedRef.current = true;
    term.clear();
  }, []);

  useEffect(() => {
    if (!connectionId || !sessionId || !terminalRef.current) return;

    disposedRef.current = false;
    reconnectAttemptRef.current = 0;
    hasConnectedRef.current = false;
    bannerClearedRef.current = false;
    awaitingProjectRef.current = compact && !!initialPath;

    const rawSaved = loadTerminalHistory(connectionId, sessionId);
    const isGitBash = terminalMode === 'git';
    const saved = isGitBash && GIT_STALE_HISTORY.test(rawSaved) ? '' : rawSaved;
    bufferRef.current = saved;
    awaitingProjectRef.current = compact && !!initialPath && !saved && !isGitBash;

    const awaitingProject = compact && !!initialPath && !saved && !isGitBash;
    const gitLivePendingRef = { current: false };

    const term = new XTerm({
      cursorBlink: !awaitingProject,
      disableStdin: awaitingProject,
      fontSize: 14,
      fontFamily: isGitBash ? "'Consolas', 'Courier New', monospace" : "'JetBrains Mono', monospace",
      theme: isGitBash ? GIT_BASH_THEME : DEFAULT_THEME,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (saved) {
      bannerClearedRef.current = true;
      hasConnectedRef.current = true;
      term.write(saved);
      if (!saved.endsWith('\n')) term.write('\r\n');
      term.writeln('\x1b[38;5;245m── session restored · reconnecting live output ──\x1b[0m');
    } else if (compact && initialPath && terminalMode === 'git') {
      // Git Bash: no blocking banner — shell connects in background
    } else if (compact && initialPath) {
      term.writeln('\x1b[38;5;39mConnecting to your project...\x1b[0m');
    } else if (compact) {
      term.writeln('\x1b[38;5;39mConnecting...\x1b[0m');
    } else {
      term.writeln('\x1b[38;5;39m╭─ OpsDeck Terminal ─────────────────────────╮\x1b[0m');
      term.writeln('\x1b[38;5;39m│\x1b[0m  Connecting...                              \x1b[38;5;39m│\x1b[0m');
      term.writeln('\x1b[38;5;39m╰─────────────────────────────────────────────╯\x1b[0m');
    }

    const showReconnecting = (message = 'Connecting again…') => {
      setReconnectBanner({ show: true, message });
      setStatusSafe('reconnecting');
    };

    const hideReconnecting = () => {
      setReconnectBanner({ show: false, message: '' });
    };

    const isTransientError = (message) => TRANSIENT_TERMINAL_ERRORS.test(message);

    const scheduleReconnect = (immediate = false) => {
      if (disposedRef.current) return;
      if (persistWhenHidden && !visible) return;
      if (reconnectAttemptRef.current >= maxReconnects) {
        hideReconnecting();
        term.writeln('\r\n\x1b[31m✗ Connection failed — click refresh or close and try again\x1b[0m\r\n');
        appendOutput('\n✗ Connection failed\n');
        stopReconnecting('error');
        return;
      }
      reconnectAttemptRef.current += 1;
      showReconnecting('Connecting again…');
      const delay = immediate ? 0 : Math.min(80 + reconnectAttemptRef.current * 120, 500);
      reconnectRef.current = setTimeout(connectWs, delay);
    };

    const reconnectNow = () => {
      if (disposedRef.current) return;
      reconnectAttemptRef.current = 0;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      connectingRef.current = false;
      showReconnecting('Connecting again…');
      connectWs();
    };

    reconnectNowRef.current = reconnectNow;
    onRegisterActions?.({ reconnect: reconnectNow });

    const permanentErrorShownRef = { current: false };

    const showPermanentError = (message) => {
      if (permanentErrorShownRef.current) return;
      permanentErrorShownRef.current = true;
      hideReconnecting();
      const hint = /authentication methods failed|authentication failed/i.test(message)
        ? '\r\n\x1b[33m→ Open Connections, edit your VPS, and save the SSH key again.\x1b[0m'
        : '';
      const line = `✗ ${message}\r\n`;
      term.writeln(`\r\n\x1b[31m${line.trim()}\x1b[0m${hint}\r\n`);
      appendOutput(`${line}${hint}\n`);
      stopReconnecting('error');
      if (/unauthorized|login required/i.test(message)) {
        notifyUnauthorized();
      }
    };

    const gitReadyTimerRef = { current: null };

    const scheduleReconnectDelayed = () => scheduleReconnect(false);

    const connectWs = () => {
      if (disposedRef.current || connectingRef.current) return;
      if (persistWhenHidden && !visible) return;

      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      const authToken = getSessionToken();
      if (!authToken) {
        term.writeln('\r\n\x1b[31m✗ Session expired — please log in again\x1b[0m\r\n');
        stopReconnecting('error');
        notifyUnauthorized();
        return;
      }

      setStatusSafe(hasConnectedRef.current ? 'reconnecting' : 'connecting');
      connectingRef.current = true;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({ connection_id: connectionId, token: authToken });
      if (initialPath) qs.set('cwd', initialPath);
      if (terminalMode) qs.set('mode', terminalMode);
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?${qs}`);
      wsRef.current = ws;

      openTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          connectingRef.current = false;
          ws.close();
        }
      }, WS_OPEN_TIMEOUT_MS);

      ws.onopen = () => {
        connectingRef.current = false;
        hideReconnecting();
        if (isGitBash) {
          enableTerminalInput(term);
        }
        if (openTimeoutRef.current) {
          clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = null;
        }
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);

        requestAnimationFrame(() => {
          fitAddon.fit();
          if (xtermRef.current) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }));
          }
        });

        if (isGitBash) {
          if (gitReadyTimerRef.current) clearTimeout(gitReadyTimerRef.current);
          gitReadyTimerRef.current = setTimeout(() => {
            if (!bannerClearedRef.current) {
              clearBanner(term);
              enableTerminalInput(term);
            }
          }, 6000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            if (gitReadyTimerRef.current) {
              clearTimeout(gitReadyTimerRef.current);
              gitReadyTimerRef.current = null;
            }
            if (gitLivePendingRef.current) {
              gitLivePendingRef.current = false;
              term.clear();
              bufferRef.current = '';
              bannerClearedRef.current = true;
              enableTerminalInput(term);
            } else if (awaitingProjectRef.current) {
              clearBanner(term);
              enableTerminalInput(term);
            } else {
              clearBanner(term);
            }
            term.write(msg.data);
            appendOutput(msg.data);
          } else if (msg.type === 'connected') {
            hasConnectedRef.current = true;
            reconnectAttemptRef.current = 0;
            hideReconnecting();
            setStatusSafe('connected');
            if (isGitBash) {
              gitLivePendingRef.current = true;
            }
            if (!saved || compact) {
              clearBanner(term);
            }
            const line = `✓ ${msg.data}\r\n`;
            if (!compact) {
              term.writeln(`\x1b[32m${line.trim()}\x1b[0m\r\n`);
            }
            appendOutput(line);
          } else if (msg.type === 'reconnected') {
            hideReconnecting();
            setStatusSafe('connected');
            if (isGitBash) {
              gitLivePendingRef.current = true;
            }
            clearBanner(term);
          } else if (msg.type === 'error') {
            if (PERMANENT_TERMINAL_ERRORS.test(msg.data)) {
              showPermanentError(msg.data);
            } else if (isTransientError(msg.data)) {
              scheduleReconnectDelayed();
            } else {
              hideReconnecting();
              const line = `✗ ${msg.data}\r\n`;
              term.writeln(`\r\n\x1b[31m${line.trim()}\x1b[0m\r\n`);
              appendOutput(line);
              setStatusSafe('error');
            }
          }
        } catch {
          clearBanner(term);
          term.write(event.data);
          appendOutput(event.data);
        }
      };

      ws.onclose = () => {
        connectingRef.current = false;
        if (openTimeoutRef.current) {
          clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = null;
        }
        if (pingRef.current) {
          clearInterval(pingRef.current);
          pingRef.current = null;
        }
        if (disposedRef.current) {
          setStatusSafe('disconnected');
          return;
        }
        if (persistWhenHidden && !visible) return;
        showReconnecting('Connection lost · connecting again…');
        scheduleReconnectDelayed();
      };

      ws.onerror = () => {
        connectingRef.current = false;
        if (!disposedRef.current) {
          showReconnecting('Connection lost · connecting again…');
        }
      };
    };

    term.onData((data) => {
      appendOutput(data);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      if (!visible && !persistWhenHidden) return;
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      if (visible) requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(terminalRef.current);

    connectWsRef.current = connectWs;

    const startTimer = setTimeout(() => {
      fitAddon.fit();
      connectWs();
    }, 0);

    if (!window.__opsdeckTerminals) window.__opsdeckTerminals = {};
    if (!window.__opsdeckTerminals[connectionId]) window.__opsdeckTerminals[connectionId] = {};

    window.__opsdeckTerminals[connectionId][sessionId] = (command) => {
      appendOutput(command);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: command }));
      }
    };

    return () => {
      clearTimeout(startTimer);
      if (gitReadyTimerRef.current) clearTimeout(gitReadyTimerRef.current);
      persistNow();
      stopReconnecting(null);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      delete window.__opsdeckTerminals?.[connectionId]?.[sessionId];
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      connectWsRef.current = null;
      reconnectNowRef.current = null;
      onRegisterActions?.(null);
      hideReconnecting();
    };
  }, [
    connectionId,
    sessionId,
    initialPath,
    terminalMode,
    compact,
    maxReconnects,
    persistWhenHidden,
    appendOutput,
    clearTimers,
    setStatusSafe,
    stopReconnecting,
    clearBanner,
    persistNow,
    enableTerminalInput,
    onRegisterActions,
  ]);

  useEffect(() => {
    if (!fitAddonRef.current) return;

    if (visible) {
      disposedRef.current = false;
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          }));
        } else if (!wsRef.current && !connectingRef.current) {
          reconnectAttemptRef.current = 0;
          setReconnectBanner({ show: true, message: 'Connecting again…' });
          connectWsRef.current?.();
        }
      });
      return undefined;
    }

    if (!persistWhenHidden) {
      persistNow();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      connectingRef.current = false;
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    }

    return undefined;
  }, [visible, persistWhenHidden, persistNow]);

  return (
    <div className="relative h-full w-full">
      <div ref={terminalRef} className={`h-full w-full ${terminalMode === 'git' ? 'bg-[#0c0c0c]' : 'bg-surface-900'}`} />
      {reconnectBanner.show && (
        <div className="absolute inset-x-0 bottom-0 z-10 mx-2 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-surface-800/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <Loader2 size={14} className="animate-spin text-amber-400 shrink-0" />
          <span className="text-xs text-amber-100 flex-1">{reconnectBanner.message}</span>
          <button
            type="button"
            onClick={() => reconnectNowRef.current?.()}
            className="p-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition-colors shrink-0"
            title="Reconnect now"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
