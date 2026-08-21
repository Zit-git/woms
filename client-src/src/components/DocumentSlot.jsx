import { useEffect, useState } from 'react';
import { uploadDocument, listDocumentsForRecord } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// One upload tile for a specific doc_type (e.g. "Signed CMR"). Used both for
// the quick-capture tiles on the General step and the formal checklist on
// the Documents step -- both just read/write the same Documents rows via
// doc_type, so uploading in one place satisfies the other automatically.
//
// variant: 'photo' (Take Photo + Upload Photo), 'pdf' (Upload PDF), 'any' (Upload),
// 'cmr' (Take Photo + Upload Photo + Upload PDF -- the signed CMR can arrive as either)
export default function DocumentSlot({
  title,
  docType,
  linkedModule,
  linkedRecordId,
  required = false,
  variant = 'any',
  multiple = false,
  onUploaded,
}) {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    listDocumentsForRecord(linkedModule, linkedRecordId)
      .then((all) => setDocs(all.filter((d) => d.doc_type === docType)))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [linkedModule, linkedRecordId, docType]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const bucketKey = variant === 'photo' ? 'CARGO_PHOTOS' : 'DOCUMENTS';
      uploadDocument(base64, file.name, bucketKey, docType, linkedModule, linkedRecordId, user?.email_id || '')
        .then(() => {
          load();
          onUploaded?.();
        })
        .catch((err) => setError(err.error || err.message || String(err)))
        .finally(() => setUploading(false));
    };
    reader.onerror = () => {
      setError('Could not read file');
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const uploaded = docs.length > 0;
  const inputId = `doc-slot-${linkedModule}-${linkedRecordId}-${docType}`.replace(/\s+/g, '-');

  return (
    <div className="doc-slot">
      <div className="doc-slot-title">
        {title}
        {required && <span className="required-mark">*</span>}
      </div>
      <div className="doc-slot-buttons">
        {(variant === 'photo' || variant === 'cmr') && (
          <label className="btn secondary small-btn" htmlFor={`${inputId}-camera`}>
            Take Photo
            <input
              id={`${inputId}-camera`}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              disabled={uploading}
              hidden
            />
          </label>
        )}
        <label className="btn secondary small-btn" htmlFor={inputId}>
          {uploading
            ? 'Uploading...'
            : variant === 'pdf'
              ? 'Upload PDF'
              : variant === 'photo' || variant === 'cmr'
                ? 'Upload Photo'
                : 'Upload'}
          <input
            id={inputId}
            type="file"
            accept={variant === 'pdf' ? 'application/pdf' : variant === 'photo' || variant === 'cmr' ? 'image/*' : undefined}
            onChange={handleFile}
            disabled={uploading}
            hidden
          />
        </label>
        {variant === 'cmr' && (
          <label className="btn secondary small-btn" htmlFor={`${inputId}-pdf`}>
            Upload PDF
            <input
              id={`${inputId}-pdf`}
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              disabled={uploading}
              hidden
            />
          </label>
        )}
      </div>
      {error && <div className="error-text small">{error}</div>}
      {!loading && (
        <div className={`doc-slot-status ${uploaded ? 'uploaded' : ''}`}>
          {uploaded ? `✓ Uploaded${multiple && docs.length > 1 ? ` (${docs.length})` : ''}` : required ? 'Required' : 'Optional'}
        </div>
      )}
    </div>
  );
}
