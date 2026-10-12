import { useEffect, useState } from 'react';
import { getFileUrl } from '../lib/api';

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|heic)$/i;

// Shows an uploaded file: images as a thumbnail (click for full size), anything
// else as an "Open" link. The storage buckets are private, so a short-lived
// signed link is requested each time it is shown.
export default function StoredFile({ fileId, bucketKey, alt = 'Uploaded file', maxHeight = 90 }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setUrl('');
    setError('');
    getFileUrl(fileId, bucketKey)
      .then((u) => !cancelled && setUrl(u))
      .catch((err) => !cancelled && setError(err.error || err.message || 'Could not load the file'));
    return () => {
      cancelled = true;
    };
  }, [fileId, bucketKey]);

  if (error) return <span className="error-text small">{error}</span>;
  if (!url) return <span className="muted small">Loading preview...</span>;
  if (IMAGE.test(fileId)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={alt} style={{ maxHeight, maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 4, background: '#fff' }} />
      </a>
    );
  }
  return (
    <a className="link-btn" href={url} target="_blank" rel="noreferrer">
      Open file
    </a>
  );
}
