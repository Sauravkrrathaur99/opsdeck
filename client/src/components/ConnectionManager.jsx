import { useState } from 'react';
import {
  Server, Plus, Trash2, Edit3, X, Check, Loader2,
  Key, Lock, TestTube,
} from 'lucide-react';
import { api } from '../api';
import DeployFolders from './DeployFolders';

function ConnectionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || {
      name: '',
      host: '',
      port: 22,
      username: 'deploy',
      auth_type: 'key',
      password: '',
      private_key_path: '~/.ssh/id_ed25519',
      private_key: '',
    }
  );
  const [showPasteKey, setShowPasteKey] = useState(false);

  return (
    <div className="p-4 bg-surface-700/50 rounded-lg border border-accent/30 space-y-3 animate-slide-up">
      <input
        className="input-field text-sm"
        placeholder="Connection name (e.g. Hostinger VPS)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          className="input-field text-sm col-span-2"
          placeholder="Host / IP address"
          value={form.host}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
        />
        <input
          className="input-field text-sm"
          placeholder="Port"
          type="number"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
        />
      </div>
      <input
        className="input-field text-sm"
        placeholder="Username (e.g. root)"
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
      />

      <div className="flex gap-2">
        <button
          onClick={() => setForm({ ...form, auth_type: 'password' })}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
            form.auth_type === 'password' ? 'bg-accent text-white' : 'bg-surface-600 text-gray-400'
          }`}
        >
          <Lock size={14} /> Password
        </button>
        <button
          onClick={() => setForm({ ...form, auth_type: 'key' })}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
            form.auth_type === 'key' ? 'bg-accent text-white' : 'bg-surface-600 text-gray-400'
          }`}
        >
          <Key size={14} /> SSH Key
        </button>
      </div>

      {form.auth_type === 'password' ? (
        <input
          className="input-field text-sm"
          type="password"
          placeholder={initial?.has_password ? '••••••••  (leave blank to keep)' : 'SSH password'}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      ) : (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Key file path (recommended)</label>
            <input
              className="input-field text-sm font-mono"
              placeholder="~/.ssh/id_ed25519"
              value={form.private_key_path || ''}
              onChange={(e) => setForm({ ...form, private_key_path: e.target.value })}
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Same as <code className="text-accent">ssh -i ~/.ssh/id_ed25519</code> — reads key from your PC
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasteKey(!showPasteKey)}
            className="text-xs text-accent hover:underline"
          >
            {showPasteKey ? 'Hide paste key option' : 'Or paste private key instead'}
          </button>
          {showPasteKey && (
            <textarea
              className="input-field text-sm font-mono min-h-[100px] resize-y"
              placeholder="Paste full key including -----BEGIN OPENSSH PRIVATE KEY----- lines"
              value={form.private_key}
              onChange={(e) => setForm({ ...form, private_key: e.target.value })}
            />
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1">
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => form.name && form.host && form.username && onSave(form)}
          className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

export default function ConnectionManager({ connections, onSelect, activeId, onUpdate, onOpenFolder }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const handleSave = async (form) => {
    if (editingId) {
      await api.connections.update(editingId, form);
    } else {
      await api.connections.create(form);
    }
    setShowForm(false);
    setEditingId(null);
    onUpdate();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this connection and all related bookmarks?')) return;
    await api.connections.delete(id);
    onUpdate();
    if (activeId === id) onSelect(null);
  };

  const handleTest = async (id) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.connections.test(id);
      setTestResult({ id, ok: true, output: result.output });
    } catch (err) {
      setTestResult({ id, ok: false, error: err.message });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-accent" />
          <span className="font-medium text-sm">VPS Connections</span>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent text-accent hover:text-white transition-colors"
          title="Add connection"
        >
          <Plus size={16} />
        </button>
      </div>

      {(showForm || editingId) && (
        <ConnectionForm
          key={editingId || 'new'}
          initial={editingId ? connections.find((c) => c.id === editingId) : null}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {connections.length === 0 && !showForm ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Server size={28} className="mx-auto mb-2 opacity-30" />
          <p>No VPS connections</p>
          <button onClick={() => setShowForm(true)} className="text-accent text-xs mt-2 hover:underline">
            Add your Hostinger VPS
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {connections.map((conn) => (
            <div key={conn.id}>
              <button
                onClick={() => onSelect(conn.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group ${
                  activeId === conn.id
                    ? 'bg-accent/20 border border-accent/40 shadow-lg shadow-accent/10'
                    : 'bg-surface-700/30 border border-transparent hover:bg-surface-700/60 hover:border-surface-600/50'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeId === conn.id ? 'bg-success animate-pulse-glow' : 'bg-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{conn.name}</div>
                  <div className="text-xs text-gray-500 truncate">{conn.username}@{conn.host}:{conn.port}</div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleTest(conn.id)} className="p-1 rounded hover:bg-surface-600 text-gray-400 hover:text-success" title="Test connection">
                    {testingId === conn.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  </button>
                  <button onClick={() => setEditingId(conn.id)} className="p-1 rounded hover:bg-surface-600 text-gray-400 hover:text-white" title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(conn.id)} className="p-1 rounded hover:bg-danger/20 text-gray-400 hover:text-danger" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </button>
              {testResult?.id === conn.id && (
                <div className={`mx-3 mt-1 p-2 rounded text-xs font-mono ${testResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {testResult.ok ? `✓ ${testResult.output}` : `✗ ${testResult.error}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeId && onOpenFolder && (
        <DeployFolders
          connection={connections.find((c) => c.id === activeId)}
          onOpenFolder={(path) => onOpenFolder(activeId, path)}
        />
      )}
    </div>
  );
}
