import { Loader2 } from 'lucide-react';
import { getFolderServerStatus } from '../folderServerStatus';

export default function FolderServerStatusBadge({ running = [], loading = false, compact = false }) {
  const status = getFolderServerStatus(running);

  if (loading && running.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-surface-600/80 text-gray-400 shrink-0">
        <Loader2 size={10} className="animate-spin" />
        Checking…
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
        status.running
          ? 'bg-success/15 text-success border-success/30'
          : 'bg-danger/15 text-danger border-danger/30'
      }`}
      title={status.detail || (status.running ? 'Gunicorn/PM2 detected for this project folder' : 'No gunicorn or PM2 app detected in this folder (OpsDeck itself is separate)')}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.running ? 'bg-success animate-pulse' : 'bg-danger'}`} />
      <span className="font-medium">{status.label}</span>
      {!compact && status.detail && (
        <span className="text-gray-500 truncate max-w-[140px]">· {status.detail}</span>
      )}
    </span>
  );
}
