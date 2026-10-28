import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { createScanGate } from '../lib/scanning';

const ELEMENT_ID = 'woms-qr-scanner-region';

// Html5Qrcode.stop() throws at once (not a rejected promise) when the camera never started, e.g. no camera or
// permission refused. Left alone that crashes the page when the window closes, so every stop goes through here.
function stopQuietly(scanner) {
  try {
    return Promise.resolve(scanner.stop()).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

// Generated QR payloads look like "WOMS-CARGO-<cargoId>" (see
// functions/generateQRCode/index.js). onDecode receives the raw decoded
// text; callers are responsible for matching it against cargo.qr_code.
// The same box takes a code typed by hand (read off the printed label or pass), or sent by a keyboard-style
// handheld scanner, so every scan can be done without a camera.
//
// Two modes. Default: the camera closes after the first code (one label, one answer). `continuous`: the camera
// stays open for the whole job and every label held up is handled in turn, so a pick list of ten units is ten
// scans, not ten times "open the camera". onDecode may return { ok, message } (or a promise of it): the message
// is shown under the camera, and { done: true } closes the window when the job is finished.
export default function QrScannerModal({ onDecode, onClose, continuous = false, title = 'Scan QR Code' }) {
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState(null); // { ok, message } of the last code handled
  const [handled, setHandled] = useState(0);

  // The camera is started once. Callers pass a new onDecode on nearly every render (it closes over fresh data);
  // restarting the camera each time left it blank or stuck, so the latest one is kept in a ref instead.
  const decodeRef = useRef(onDecode);
  decodeRef.current = onDecode;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const gate = useRef(null);
  if (!gate.current) gate.current = createScanGate();

  const handle = async (text) => {
    if (!gate.current.enter(text)) return;
    try {
      const out = await decodeRef.current(text);
      if (out && typeof out === 'object') {
        setResult({ ok: out.ok !== false, message: out.message || '' });
        if (out.ok !== false) setHandled((n) => n + 1);
        if (out.ok !== false) navigator.vibrate?.(60);
        if (out.done) closeRef.current();
      }
    } catch (err) {
      setResult({ ok: false, message: err?.message || String(err) });
    } finally {
      gate.current.leave();
    }
  };

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID);
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (stopped) return;
          if (continuous) {
            handle(decodedText);
            return;
          }
          stopped = true;
          stopQuietly(scanner).finally(() => decodeRef.current(decodedText));
        },
        () => {} // per-frame decode failures are normal while aiming, ignore
      )
      .catch((err) => setError(err.message || String(err) || 'Could not access camera'));

    return () => {
      stopped = true;
      stopQuietly(scanner);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous]);

  const submitTyped = async (e) => {
    e.preventDefault();
    const code = typed.trim();
    if (!code) return;
    setTyped('');
    if (continuous) await handle(code);
    else decodeRef.current(code);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="toolbar">
          <h3>{title}</h3>
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {error && (
          <div className="error-text">
            {error}. Check camera permissions, or type the code below instead.
          </div>
        )}
        {continuous && !error && <p className="muted small">The camera stays on: hold the next label up after each one.{handled ? ` ${handled} done so far.` : ''}</p>}
        <div id={ELEMENT_ID} style={{ width: '100%' }} />
        {result && (
          <div role="status" className={result.ok ? 'scan-ok' : 'error-text'} style={{ marginTop: 8, fontWeight: 600 }}>
            {result.ok ? '✓ ' : ''}
            {result.message}
          </div>
        )}
        <form className="form-row" onSubmit={submitTyped}>
          <label htmlFor="woms-manual-code">Or type the code</label>
          <input
            id="woms-manual-code"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Code printed under the QR, e.g. WOMS-CARGO-123 or OB-2026-207030"
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus={Boolean(error)}
          />
          <button type="submit" className="btn" disabled={!typed.trim()}>
            Use this code
          </button>
        </form>
      </div>
    </div>
  );
}
