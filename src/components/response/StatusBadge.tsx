interface Props {
  status: number;
  statusText: string;
}

function statusColor(status: number): string {
  if (status >= 500) return 'var(--status-5xx)';
  if (status >= 400) return 'var(--status-4xx)';
  if (status >= 300) return 'var(--status-3xx)';
  if (status >= 200) return 'var(--status-2xx)';
  return 'var(--text-secondary)';
}

// 12% opacity pill = append 1F alpha... but vars are css; use color-mix for bg.
export function StatusBadge({ status, statusText }: Props) {
  const color = statusColor(status);
  return (
    <span
      className="status-badge"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {status} {statusText}
    </span>
  );
}
