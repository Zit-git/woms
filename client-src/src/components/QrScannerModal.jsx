import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ELEMENT_ID = 'woms-qr-scanner-region';

// Generated QR payloads look like "WOMS-CARGO-<cargoId>" (see
// functions/generateQRCode/index.js). onDecode receives the raw decoded
// text; callers are responsible for matching it against cargo.qr_code.
export default function QrScannerModal({ onDecode, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');

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
          scanner
            .stop()
            .catch(() => {})
            .finally(() => onDecode(decodedText));
        },
        () => {} // per-frame decode failures are normal while aiming, ignore
      )
      .catch((err) => setError(err.message || String(err) || 'Could not access camera'));

    return () => {
      stopped = true;
      scanner.stop().catch(() => {});
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
            {error}. Check camera permissions, or use the dropdown below instead.
          </div>
        )}
        <div id={ELEMENT_ID} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
