import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import type { SecretReviewState } from '../../lib/storage/environmentFiles';

interface Props {
  review: SecretReviewState | null;
  busy: boolean;
  error: string;
  onComplete: (choice: 'rotated' | 'purged') => void;
}

export function SecretReviewDialog({ review, busy, error, onComplete }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  if (!review) return null;
  return <div className="modal-backdrop secret-review-backdrop">
    <section className="secret-review-dialog" role="dialog" aria-modal="true" aria-labelledby="secret-review-title">
      <header><span><AlertTriangle size={16} /></span><div><h2 id="secret-review-title">Environment credentials were previously committed</h2><p>TesAPI moved every value to local-only storage, but old Git commits may still contain them.</p></div></header>
      <div className="secret-review-body">
        <div className="secret-review-affected"><strong>Affected variables</strong><div>{review.affected.map((name) => <code key={name}><KeyRound size={11} />{name}</code>)}</div></div>
        <label className="secret-review-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><b>I understand these credentials must be revoked or rotated.</b><small>Removing Git history cannot make an exposed credential secret again.</small></span></label>
        <button className="secret-guide-toggle" onClick={() => setGuideOpen((value) => !value)}>{guideOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} History purge steps</button>
        {guideOpen && <ol className="secret-guide"><li>Rotate the affected credentials first.</li><li>Run the all-branch <code>git filter-repo</code> procedure in <code>docs/git-history-purge.md</code>.</li><li>Force-push rewritten branches and have every teammate re-clone.</li></ol>}
        {error && <p className="save-modal-error" role="alert">{error}</p>}
      </div>
      <footer><button className="modal-cancel" disabled={!acknowledged || busy} onClick={() => onComplete('purged')}><Check size={13} /> History purged</button><button className="modal-save" disabled={!acknowledged || busy} onClick={() => onComplete('rotated')}>{busy ? <span className="spinner" /> : <KeyRound size={13} />}{busy ? 'Checking…' : 'Credentials rotated'}</button></footer>
    </section>
  </div>;
}
