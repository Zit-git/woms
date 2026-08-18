import { useEffect, useState } from 'react';
import { uploadDocument, listDocumentsForRecord } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const DOC_TYPES = ['CMR', 'Packing List', 'Delivery Note', 'Bill of Lading', 'Commercial Invoice', 'Photo', 'Operational Attachment'];

// bucketKey: 'DOCUMENTS' | 'CARGO_PHOTOS'
export default function DocumentUploader({ linkedModule, linkedRecordId, bucketKey = 'DOCUMENTS', title = 'Documents & Photos' }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docType, setDocType] = useState(bucketKey === 'CARGO_PHOTOS' ? 'Photo' : DOC_TYPES[0]);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    listDocumentsForRecord(linkedModule, linkedRecordId)
      .then(setDocs)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [linkedModule, linkedRecordId]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // strip data: URL prefix
      uploadDocument(base64, file.name, bucketKey, docType, linkedModule, linkedRecordId, user?.email_id || '')
        .then(load)
        .catch((err) => setError(err.error || err.message || String(err)))
        .finally(() => setUploading(false));
    };
    reader.onerror = () => {
      setError('Could not read file');
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  return (
    <div className="card">
      <h3>{title}</h3>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>{uploading ? 'Uploading...' : 'Choose file'}</label>
          <input type="file" onChange={handleFile} disabled={uploading} accept={bucketKey === 'CARGO_PHOTOS' ? 'image/*' : undefined} />
        </div>
      </div>

      {loading ? (
        <p className="muted small">Loading...</p>
      ) : docs.length === 0 ? (
        <p className="muted small">No documents uploaded yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {docs.map((d) => (
            <li key={d.ROWID}>
              <span className="status-badge">{d.doc_type}</span> {d.file_id}
              <span className="muted"> — {d.uploaded_by}, {d.uploaded_date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
