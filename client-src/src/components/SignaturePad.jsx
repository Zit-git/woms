import { useEffect, useRef, useState } from 'react';
import { uploadDocument, listDocumentsForRecord } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Captures a driver signature on receipt/handover and stores it through the
// same Documents pipeline as photos/paperwork, tagged with docType so it
// shows up alongside them on the record.
export default function SignaturePad({ linkedModule, linkedRecordId, docType, title = 'Driver Signature' }) {
  const { user } = useAuth();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    listDocumentsForRecord(linkedModule, linkedRecordId)
      .then((docs) => setExisting(docs.find((d) => d.doc_type === docType) || null))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [linkedModule, linkedRecordId, docType]);

  useEffect(() => {
    if (!capturing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    hasStroke.current = false;

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      return { x: point.clientX - rect.left, y: point.clientY - rect.top };
    };
    const start = (e) => {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasStroke.current = true;
    };
    const end = () => {
      drawing.current = false;
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, [capturing]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
  };

  const save = () => {
    if (!hasStroke.current) {
      setError('Please sign before saving.');
      return;
    }
    setSaving(true);
    setError('');
    const base64 = canvasRef.current.toDataURL('image/png').split(',')[1];
    uploadDocument(base64, `signature-${Date.now()}.png`, 'DOCUMENTS', docType, linkedModule, linkedRecordId, user?.email_id || '')
      .then(() => {
        setCapturing(false);
        load();
      })
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <div className="card">
      <h3>{title}</h3>
      {error && <div className="error-text">{error}</div>}

      {loading ? (
        <p className="muted small">Loading...</p>
      ) : capturing ? (
        <>
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            style={{ border: '1px solid var(--border)', borderRadius: 6, touchAction: 'none', width: '100%', maxWidth: 400 }}
          />
          <div className="form-actions">
            <button className="btn" type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Signature'}
            </button>
            <button className="btn secondary" type="button" onClick={clear} disabled={saving}>
              Clear
            </button>
            <button className="btn secondary" type="button" onClick={() => setCapturing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </>
      ) : existing ? (
        <p className="muted small">
          Signature captured by {existing.uploaded_by} on {existing.uploaded_date}.{' '}
          <button className="link-btn" onClick={() => setCapturing(true)}>
            Re-capture
          </button>
        </p>
      ) : (
        <button className="btn secondary" onClick={() => setCapturing(true)}>
          Capture Signature
        </button>
      )}
    </div>
  );
}
