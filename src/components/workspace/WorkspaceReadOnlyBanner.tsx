import { LockKeyhole } from 'lucide-react';

export function WorkspaceReadOnlyBanner({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <aside className="workspace-read-only-banner" role="status">
    <LockKeyhole size={15} />
    <div><strong>Workspace opened read-only</strong><span>{reason}</span></div>
  </aside>;
}
