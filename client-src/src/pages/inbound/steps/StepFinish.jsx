import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendInboundConfirmationEmail, startNewInboundAdvice } from '../../../lib/api';

export default function StepFinish({ advice, patchAdvice, goBack, saving }) {
  const navigate = useNavigate();
  const [to, setTo] = useState(advice.customer_email || '');
  const [cc, setCc] = useState('');
  const [completing, setCompleting] = useState(null); // 'new' | 'dashboard' | null
  const [error, setError] = useState('');

  const alreadyCompleted = advice.status === 'Completed';

  const complete = (target) => {
    setCompleting(target);
    setError('');
    const message = `Inbound ${advice.inbound_reference} has been received and is now in stock.`;
    sendInboundConfirmationEmail(advice.ROWID, to, message)
      .catch(() => null) // notification failure shouldn't block completion
      .then(() => patchAdvice({ status: 'Completed' }))
      .then(() => (target === 'new' ? startNewInboundAdvice(advice.warehouse_id) : Promise.resolve(null)))
      .then((created) => navigate(target === 'new' ? `/inbound/${created.ROWID}` : '/'))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setCompleting(null));
  };

  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <div className="muted small" style={{ letterSpacing: 0.5 }}>
            INBOUND REFERENCE
          </div>
          <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
        </div>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}`} target="_blank" rel="noreferrer">
          Reprint Labels
        </a>
      </div>

      {alreadyCompleted ? (
        <div className="finish-ready">
          <div className="finish-check">✓</div>
          <h3>Inbound Completed</h3>
          <p className="muted">This inbound has already been completed and marked in stock.</p>
        </div>
      ) : (
        <div className="finish-ready">
          <div className="finish-check">✓</div>
          <h3>Ready to Complete</h3>
          <p className="muted">All information has been reviewed and confirmed. You can now complete the inbound.</p>
        </div>
      )}

      {error && <div className="error-text">{error}</div>}

      <h3>Inbound Confirmation Email</h3>
      <div className="form-grid-3">
        <div className="form-row">
          <label>Send to (To)</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="form-row">
          <label>CC (optional)</label>
          <input type="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Add email address" />
        </div>
      </div>
      <p className="muted small">
        Attachments: Signed CMR, Photos, Inbound Summary (PDF), Label Overview (PDF) — reference{' '}
        <a href={`${import.meta.env.BASE_URL}print/inbound/${advice.ROWID}`} target="_blank" rel="noreferrer">
          Inbound Summary
        </a>{' '}
        and{' '}
        <a href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}`} target="_blank" rel="noreferrer">
          Label Overview
        </a>
        .
      </p>

      {advice.remarks && (
        <div className="check-block">
          <div className="check-block-title">Remarks</div>
          <div>{advice.remarks}</div>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn secondary" onClick={goBack} disabled={alreadyCompleted}>
          &larr; Back
        </button>
        {!alreadyCompleted && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn secondary" onClick={() => complete('new')} disabled={!!completing || saving || !to}>
              {completing === 'new' ? 'Completing...' : 'Complete Inbound + New'}
            </button>
            <button className="btn" onClick={() => complete('dashboard')} disabled={!!completing || saving || !to}>
              {completing === 'dashboard' ? 'Completing...' : 'Complete Inbound + Return to Dashboard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
