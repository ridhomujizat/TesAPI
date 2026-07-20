import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { WorkspaceRecord } from '../../../types';
import type { ToastMessage } from '../../Toast';
import { useGitStore } from '../../../store/gitStore';

export function GitRemoteDialog({ workspace, onClose, onToast }: { workspace: WorkspaceRecord; onClose: () => void; onToast: (message: ToastMessage) => void }) {
  const git = useGitStore(); const [url, setUrl] = useState(git.remote ?? ''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (git.remote != null) setUrl(git.remote); }, [git.remote]);
  const save = async () => { setBusy(true); try { await git.setRemote(url); onToast({ title: 'Remote saved' }); onClose(); } catch (error) { onToast({ title: 'Could not save remote', detail: String(error), tone: 'error' }); } finally { setBusy(false); } };
  const test = async () => { setBusy(true); try { await git.testRemote(url); onToast({ title: 'Remote connection works' }); } catch (error) { onToast({ title: 'Remote connection failed', detail: String(error), tone: 'error' }); } finally { setBusy(false); } };
  return <div className="modal-backdrop"><section className="git-remote-dialog" role="dialog" aria-modal="true" aria-labelledby="git-remote-title"><header><div><span className="label-caps">Git remote</span><h2 id="git-remote-title">Manage origin</h2></div><button aria-label="Close remotes" onClick={onClose}><X size={15} /></button></header><div className="git-remote-body"><label><span>Repository URL</span><input autoFocus className="mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="git@github.com:team/api.git" /></label><small>Workspace: {workspace.name}</small></div><footer><button className="modal-cancel" onClick={onClose}>Cancel</button><button className="modal-cancel" disabled={busy || !url.trim()} onClick={() => void test()}>Test connection</button><button className="modal-save" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save remote'}</button></footer></section></div>;
}
