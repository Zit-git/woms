import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendInboundConfirmationEmail, startNewInboundAdvice } from '../../../lib/api';

export default function StepFinish({ advice, patchAdvice, goBack, saving }) {
  const navigate = useNavigate();
  const [to, setTo] = useState(advice.customer_email || '');
  const [cc, setCc] = useState('');
  const [completing, setCompleting] = useState(null); // 'new' | 'dashboard' | null
  const [error, setError] = useState('');

  const [emailWarning, setEmailWarning] = useState('');
  const [resumeTarget, setResumeTarget] = useState(null);

  const alreadyCompleted = advice.status === 'Completed';

  const proceed = (target) =>
    target === 'new'
      ? startNewInboundAdvice(advice.warehouse_id).then((created) => navigate(`/inbound/${created.ROWID}/wizard`))
      : Promise.resolve(navigate('/'));

  // Sends the confirmation email; resolves true if it went out. A failure is
  // shown to the user (with a retry) but never undoes the completed inbound.
  const sendEmail = () =>
    sendInboundConfirmationEmail(advice.ROWID, to, `Inbound ${advice.inbound_reference} has been received and is now in stock.`)
      .then(() => true)
      .catch((err) => {
        setEmailWarning(`The inbound is completed, but the confirmation email could not be sent: ${err?.error || err?.message || err}`);
        return false;
      });

  const complete = (target) => {
    setCompleting(target);
    setError('');
    setEmailWarning('');
    setResumeTarget(target);
    patchAdvice({ status: 'Completed' })
      .then(sendEmail)
      .then((sent) => (sent ? proceed(target) : null))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setCompleting(null));
  };

  const retryEmail = () => {
    setCompleting(resumeTarget || 'dashboard');
    setEmailWarning('');
    sendEmail()
      .then((sent) => (sent ? proceed(resumeTarget) : null))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setCompleting(null));
  };

  const continueWithoutEmail = () => {
    setEmailWarning('');
    proceed(resumeTarget).catch((err) => setError(err.message || String(err)));
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
      {emailWarning && (
        <div className="card" style={{ borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}>
          <p style={{ marginTop: 0 }}>{emailWarning}</p>
          <div className="form-actions">
            <button className="btn" onClick={retryEmail} disabled={!!completing}>
              {completing ? 'Sending...' : 'Send again'}
            </button>
            <button className="btn secondary" onClick={continueWithoutEmail} disabled={!!completing}>
              Continue without email
            </button>
          </div>
        </div>
      )}

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
