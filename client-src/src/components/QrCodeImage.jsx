import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Renders a scannable QR code for a payload string already stored on the
// record (e.g. Cargo.qr_code = "WOMS-CARGO-123"). Generated client-side so
// printable pages don't need a round trip to Stratus for the stored PNG --
// the payload is what the in-app scanner matches against, not the image.
export default function QrCodeImage({ value, size = 140 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!value) return null;
  if (!src) return <div style={{ width: size, height: size }} className="muted small" />;
  return <img src={src} width={size} height={size} alt={value} />;
}
