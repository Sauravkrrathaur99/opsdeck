import { useState } from 'react';
import { Shield, Lock, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { setSessionToken } from '../auth';

export default function LoginGate({ onSuccess, secured }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.login(token.trim());
      setSessionToken(res.session);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-surface-900 p-4">
      <div className="w-full max-w-md card p-8 animate-fade-in">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/20 mx-auto mb-4">
          <Shield size={28} className="text-accent" />
        </div>
        <h1 className="text-xl font-bold text-center mb-1">OpsDeck Locked</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {secured
            ? 'Enter your access token to unlock the VPS command center.'
            : 'Authentication is optional on localhost.'}
        </p>

        {secured && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs mb-4">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Without this token, nobody can SSH into your servers or read `.env` files through OpsDeck.</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Access token</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                className="input-field pl-9 font-mono text-sm"
                placeholder="From OPSDECK_ACCESS_TOKEN in .env"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
          </div>

          {error && (
            <p className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!token.trim() || loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            Unlock OpsDeck
          </button>
        </form>

        <p className="text-[10px] text-gray-600 text-center mt-6">
          Token is stored in this browser tab only · never share it · rotate if leaked
        </p>
      </div>
    </div>
  );
}
