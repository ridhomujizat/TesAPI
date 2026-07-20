import { useEffect, useState } from 'react';
import { GitBranch, UserRound } from 'lucide-react';

interface Props { open: boolean; busy: boolean; error: string; onSave: (name: string, email: string) => void }

export function GitIdentityDialog({ open, busy, error, onSave }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => { if (open) { setName(''); setEmail(''); } }, [open]);
  if (!open) return null;
  return <div className="modal-backdrop git-identity-backdrop"><section className="git-identity-dialog" role="dialog" aria-modal="true" aria-labelledby="git-identity-title"><header><span><GitBranch size={16} /></span><div><h2 id="git-identity-title">Set your Git identity</h2><p>These details identify your commits for teammates.</p></div></header><div className="git-identity-body"><label><span>Name</span><div><UserRound size={13} /><input autoFocus value={name} placeholder="Ridho Mujizat" onChange={(event) => setName(event.target.value)} /></div></label><label><span>Email</span><input type="email" value={email} placeholder="ridho@example.com" onChange={(event) => setEmail(event.target.value)} /></label>{error && <p className="save-modal-error">{error}</p>}</div><footer><button className="modal-save" disabled={busy || !name.trim() || !email.trim()} onClick={() => onSave(name.trim(), email.trim())}>{busy ? 'Saving…' : 'Save identity'}</button></footer></section></div>;
}
