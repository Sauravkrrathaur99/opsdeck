import { useState, useEffect } from 'react';
import {
  Zap, Plus, Play, Trash2, Edit3, X, Check, Loader2,
  Terminal, Server, Database, Settings, FolderOpen,
} from 'lucide-react';
import { api } from '../api';

const CATEGORIES = ['General', 'Deploy', 'Docker', 'Nginx', 'Database', 'Logs', 'Maintenance'];

const categoryIcons = {
  General: Terminal,
  Deploy: Server,
  Docker: Server,
  Nginx: Settings,
  Database: Database,
  Logs: FolderOpen,
  Maintenance: Settings,
};

function CommandForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', command: '', description: '', category: 'General' });

  return (
    <div className="p-4 bg-surface-700/50 rounded-lg border border-accent/30 space-y-3 animate-slide-up">
      <input
        className="input-field text-sm"
        placeholder="Command name (e.g. Restart Nginx)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <textarea
        className="input-field text-sm font-mono min-h-[80px] resize-y"
        placeholder="Command to run (e.g. sudo systemctl restart nginx)"
        value={form.command}
        onChange={(e) => setForm({ ...form, command: e.target.value })}
      />
      <input
        className="input-field text-sm"
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <select
        className="input-field text-sm"
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value })}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1">
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => form.name && form.command && onSave(form)}
          className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

export default function SavedCommands({ connectionId }) {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [output, setOutput] = useState(null);
  const [filter, setFilter] = useState('all');

  const loadCommands = async () => {
    setLoading(true);
    try {
      const data = await api.commands.list(connectionId);
      setCommands(data);
    } catch {
      setCommands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommands();
  }, [connectionId]);

  const handleSave = async (form) => {
    if (editingId) {
      await api.commands.update(editingId, { ...form, connection_id: connectionId });
    } else {
      await api.commands.create({ ...form, connection_id: connectionId });
    }
    setShowForm(false);
    setEditingId(null);
    loadCommands();
  };

  const handleRun = async (cmd) => {
    if (!connectionId) return;
    setRunningId(cmd.id);
    setOutput(null);
    try {
      if (window.__opsdeckSendCommand) {
        window.__opsdeckSendCommand(cmd.command);
        setOutput({ ok: true, message: `Sent to terminal: ${cmd.name}` });
      } else {
        const result = await api.commands.run(cmd.id, connectionId);
        setOutput({ ok: true, stdout: result.stdout, stderr: result.stderr });
      }
    } catch (err) {
      setOutput({ ok: false, error: err.message });
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id) => {
    await api.commands.delete(id);
    loadCommands();
  };

  const categories = [...new Set(commands.map((c) => c.category))];
  const filtered = filter === 'all' ? commands : commands.filter((c) => c.category === filter);

  const grouped = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  return (
    <div className="card flex flex-col h-full overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600/50 bg-surface-700/30">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-warning" />
          <span className="font-medium text-sm">Saved Commands</span>
          <span className="text-xs text-gray-500 bg-surface-600 px-2 py-0.5 rounded-full">{commands.length}</span>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {categories.length > 1 && (
        <div className="px-3 py-2 border-b border-surface-600/30 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${filter === 'all' ? 'bg-accent text-white' : 'bg-surface-600/50 text-gray-400 hover:text-white'}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${filter === cat ? 'bg-accent text-white' : 'bg-surface-600/50 text-gray-400 hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {showForm && (
          <CommandForm
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
        ) : commands.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <Zap size={32} className="mx-auto mb-2 opacity-30" />
            <p>No saved commands yet</p>
            <p className="text-xs mt-1">Add your frequently used VPS commands here</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, cmds]) => {
            const Icon = categoryIcons[category] || Terminal;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Icon size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{category}</span>
                </div>
                <div className="space-y-1.5">
                  {cmds.map((cmd) => (
                    <div key={cmd.id} className="group bg-surface-700/30 hover:bg-surface-700/60 rounded-lg border border-surface-600/30 transition-all">
                      {editingId === cmd.id ? (
                        <div className="p-3">
                          <CommandForm
                            initial={cmd}
                            onSave={handleSave}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-3">
                          <button
                            onClick={() => handleRun(cmd)}
                            disabled={!connectionId || runningId === cmd.id}
                            className="shrink-0 w-9 h-9 rounded-lg bg-accent/20 hover:bg-accent hover:text-white text-accent flex items-center justify-center transition-all disabled:opacity-40"
                            title="Run command"
                          >
                            {runningId === cmd.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{cmd.name}</div>
                            <div className="text-xs text-gray-500 font-mono truncate">{cmd.command}</div>
                            {cmd.description && <div className="text-xs text-gray-600 mt-0.5">{cmd.description}</div>}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingId(cmd.id)} className="p-1.5 rounded hover:bg-surface-600 text-gray-400 hover:text-white">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDelete(cmd.id)} className="p-1.5 rounded hover:bg-danger/20 text-gray-400 hover:text-danger">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {output && (
          <div className={`p-3 rounded-lg text-xs font-mono ${output.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
            {output.message || output.stdout || output.error}
            {output.stderr && <pre className="mt-1 text-warning">{output.stderr}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}
