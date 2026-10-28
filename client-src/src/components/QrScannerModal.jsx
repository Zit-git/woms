import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

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
export default function QrScannerModal({ onDecode, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (stopped) return;
          stopped = true;
          stopQuietly(scanner).finally(() => onDecode(decodedText));
        },
        () => {} // per-frame decode failures are normal while aiming, ignore
      )
      .catch((err) => setError(err.message || String(err) || 'Could not access camera'));

    return () => {
      stopped = true;
      stopQuietly(scanner);
    };
  }, [onDecode]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="toolbar">
          <h3>Scan QR Code</h3>
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {error && (
          <div className="error-text">
            {error}. Check camera permissions, or type the code below instead.
          </div>
        )}
        <div id={ELEMENT_ID} style={{ width: '100%' }} />
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onDecode(typed.trim());
          }}
        >
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
