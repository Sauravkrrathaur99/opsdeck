import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  X, Save, Copy, Scissors, ClipboardPaste, FileText, Loader2,
  Check, AlertCircle, Keyboard, Shield, Search, ChevronRight, Folder, File,
} from 'lucide-react';
import { api } from '../api';
import { isSecretFile, languageForFile } from '../fileUtils';

function EditorBreadcrumb({ path, connectionId, onPickFile, onBrowseFolder }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [folderItems, setFolderItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const parts = path === '/' ? [] : path.split('/').filter(Boolean);
  const fileName = parts.pop();
  const folders = parts.map((part, i) => ({
    name: part,
    path: `/${parts.slice(0, i + 1).join('/')}`,
  }));

  useEffect(() => {
    if (openIdx === null) return;
    const folderPath = openIdx === 'file'
      ? path.replace(/\/[^/]+$/, '')
      : openIdx === 'root'
        ? '/'
        : folders[openIdx]?.path;
    if (!folderPath) return;

    setLoading(true);
    api.files.list(connectionId, folderPath)
      .then((data) => {
        const files = data.items
          .filter((i) => i.type === 'file')
          .sort((a, b) => a.name.localeCompare(b.name));
        setFolderItems(files);
      })
      .catch(() => setFolderItems([]))
      .finally(() => setLoading(false));
  }, [openIdx, connectionId, path]);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenIdx(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const dropdown = (items, anchor) => (
    <div className="absolute top-full left-0 mt-1 z-[70] min-w-[220px] max-w-[360px] max-h-56 overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg shadow-xl py-1">
      {loading ? (
        <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500">No files in folder</div>
      ) : (
        items.map((item) => (
          <button
            key={item.path}
            onClick={() => { onPickFile(item); setOpenIdx(null); }}
            className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 hover:bg-surface-700 ${
              item.path === path ? 'text-accent bg-accent/10' : 'text-gray-300'
            }`}
          >
            <File size={11} className={isSecretFile(item.name) ? 'text-warning' : 'text-gray-500 shrink-0'} />
            <span className="truncate">{item.name}</span>
          </button>
        ))
      )}
      {anchor && (
        <button
          onClick={() => { onBrowseFolder?.(anchor); setOpenIdx(null); }}
          className="w-full text-left px-3 py-1.5 text-[10px] text-gray-500 hover:bg-surface-700 border-t border-surface-600/50 flex items-center gap-1"
        >
          <Folder size={10} /> Open folder in browser
        </button>
      )}
    </div>
  );

  return (
    <div ref={ref} className="flex items-center gap-0.5 text-[10px] font-mono text-gray-500 min-w-0 flex-wrap">
      <button
        onClick={() => setOpenIdx(openIdx === 'root' ? null : 'root')}
        className="hover:text-accent px-0.5 relative"
      >
        /
        {openIdx === 'root' && dropdown(folderItems, '/')}
      </button>
      {folders.map((f, i) => (
        <span key={f.path} className="flex items-center shrink-0">
          <ChevronRight size={10} className="text-gray-600" />
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="hover:text-accent px-0.5 relative max-w-[100px] truncate"
          >
            {f.name}
            {openIdx === i && dropdown(folderItems, f.path)}
          </button>
        </span>
      ))}
      {fileName && (
        <>
          <ChevronRight size={10} className="text-gray-600 shrink-0" />
          <button
            onClick={() => setOpenIdx(openIdx === 'file' ? null : 'file')}
            className="text-gray-300 hover:text-accent px-0.5 relative max-w-[140px] truncate"
          >
            {fileName}
            {openIdx === 'file' && dropdown(folderItems, path.replace(/\/[^/]+$/, ''))}
          </button>
        </>
      )}
    </div>
  );
}

function EditorFileSearch({ connectionId, projectRoot, currentPath, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      setLoading(true);
      api.files.search(connectionId, projectRoot, query.trim(), 35)
        .then((data) => setResults(data.items || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timerRef.current);
  }, [query, connectionId, projectRoot]);

  return (
    <div ref={ref} className="relative w-48 sm:w-64 shrink-0">
      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        id="editor-file-search"
        className="input-field text-[10px] pl-7 py-1.5 font-mono w-full"
        placeholder={`Search in ${projectRoot.split('/').pop() || 'project'}…`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[70] max-h-64 overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg shadow-xl py-1">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No files found</div>
          ) : (
            results.map((item) => (
              <button
                key={item.path}
                onClick={() => { onPick(item); setQuery(''); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 hover:bg-surface-700 ${
                  item.path === currentPath ? 'bg-accent/10' : ''
                }`}
              >
                <div className="text-xs font-mono text-gray-200 truncate">{item.name}</div>
                <div className="text-[9px] text-gray-500 truncate">{item.path}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function FileEditor({ open, onClose, connectionId, file, projectRoot, onBrowseFolder }) {
  const editorRef = useRef(null);
  const [activeFile, setActiveFile] = useState(file);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const path = activeFile?.path;
  const name = activeFile?.name || path?.split('/').pop() || 'file';
  const secret = isSecretFile(name);
  const dirty = content !== original;
  const searchRoot = projectRoot || path?.replace(/\/[^/]+$/, '') || '/';

  useEffect(() => {
    if (file) setActiveFile(file);
  }, [file?.path]);

  const loadFile = useCallback(async (targetPath) => {
    if (!connectionId || !targetPath) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const data = await api.files.read(connectionId, targetPath);
      setContent(data.content ?? '');
      setOriginal(data.content ?? '');
    } catch (err) {
      setError(err.message);
      setContent('');
      setOriginal('');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (open && path) loadFile(path);
  }, [open, path, loadFile]);

  const switchFile = useCallback((nextFile) => {
    if (!nextFile?.path || nextFile.path === path) return;
    if (dirty && !window.confirm('Discard unsaved changes to this file?')) return;
    setActiveFile(nextFile);
  }, [dirty, path]);

  const handleSave = useCallback(async () => {
    if (!connectionId || !path || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.files.write(connectionId, path, content);
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [connectionId, path, content, saving]);

  const runEditorAction = (actionId) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.getAction(actionId)?.run();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        document.getElementById('editor-file-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dirty, handleSave]);

  const handleClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  if (!open || !activeFile) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-600/50 bg-surface-800 shrink-0 flex-wrap">
        <FileText size={16} className="text-accent shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{name}</span>
            {secret && (
              <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded flex items-center gap-1">
                <Shield size={10} /> secret
              </span>
            )}
            {dirty && <span className="text-[10px] text-warning">● modified</span>}
            {saved && <span className="text-[10px] text-success flex items-center gap-0.5"><Check size={10} /> saved</span>}
          </div>
          {path && (
            <EditorBreadcrumb
              path={path}
              connectionId={connectionId}
              onPickFile={switchFile}
              onBrowseFolder={onBrowseFolder}
            />
          )}
        </div>

        <EditorFileSearch
          connectionId={connectionId}
          projectRoot={searchRoot}
          currentPath={path}
          onPick={switchFile}
        />

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => runEditorAction('editor.action.clipboardCopyAction')} className="p-2 rounded hover:bg-surface-600 text-gray-400 hover:text-white" title="Copy">
            <Copy size={15} />
          </button>
          <button onClick={() => runEditorAction('editor.action.clipboardCutAction')} className="p-2 rounded hover:bg-surface-600 text-gray-400 hover:text-white" title="Cut">
            <Scissors size={15} />
          </button>
          <button onClick={() => runEditorAction('editor.action.clipboardPasteAction')} className="p-2 rounded hover:bg-surface-600 text-gray-400 hover:text-white" title="Paste">
            <ClipboardPaste size={15} />
          </button>
          <button onClick={() => runEditorAction('actions.find')} className="px-2 py-1.5 rounded hover:bg-surface-600 text-gray-400 hover:text-white text-[10px]" title="Find in file">
            Find
          </button>
          <button onClick={() => setShowShortcuts(!showShortcuts)} className={`p-2 rounded ${showShortcuts ? 'bg-accent/20 text-accent' : 'hover:bg-surface-600 text-gray-400'}`}>
            <Keyboard size={15} />
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
          <button onClick={handleClose} className="p-2 rounded hover:bg-surface-600 text-gray-400">
            <X size={18} />
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="px-4 py-2 bg-surface-800/80 border-b border-surface-600/30 text-[10px] text-gray-400 flex flex-wrap gap-x-4 gap-y-1 shrink-0">
          <span><kbd className="text-gray-300">Ctrl+S</kbd> Save</span>
          <span><kbd className="text-gray-300">Ctrl+P</kbd> Focus file search</span>
          <span><kbd className="text-gray-300">Ctrl+F</kbd> Find in file</span>
          <span><kbd className="text-gray-300">Breadcrumb</kbd> Pick sibling file</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-danger/10 border-b border-danger/30 text-danger text-xs flex items-start gap-2 shrink-0">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap font-sans">{error}</pre>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : (
          <Editor
            key={path}
            height="100%"
            language={languageForFile(name)}
            value={content}
            onChange={(v) => setContent(v ?? '')}
            onMount={(editor) => { editorRef.current = editor; }}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: true },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              lineNumbers: 'on',
              bracketPairColorization: { enabled: true },
              folding: true,
            }}
          />
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-surface-600/50 bg-surface-800 text-[10px] text-gray-500 flex justify-between shrink-0">
        <span>{languageForFile(name)} · searching {searchRoot}</span>
        <span>Ctrl+P search · click breadcrumb to switch file</span>
      </div>
    </div>
  );
}
