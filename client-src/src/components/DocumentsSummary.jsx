import { useEffect, useState } from 'react';
import { listDocumentsForRecord } from '../lib/api';

// Read-only list of what's already been uploaded for a record -- unlike
// DocumentUploader/DocumentSlot, this has no upload controls, for use on
// detail/summary views where the record is no longer being actively edited.
export default function DocumentsSummary({ linkedModules, recordId, title = 'Documents' }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all(linkedModules.map((m) => listDocumentsForRecord(m, recordId)))
      .then((lists) => setDocs(lists.flat()))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(linkedModules), recordId]);

  return (
    <div className="card">
      <h3>{title}</h3>
      {loading ? (
        <p className="muted small">Loading...</p>
      ) : docs.length === 0 ? (
        <p className="muted small">No documents uploaded.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {docs.map((d) => (
            <li key={d.ROWID}>
              <span className="status-badge">{d.doc_type}</span>{' '}
              <span className="muted">
                — {d.uploaded_by}, {d.uploaded_date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
