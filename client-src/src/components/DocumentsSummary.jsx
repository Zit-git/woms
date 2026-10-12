import { useEffect, useState } from 'react';
import { listDocumentsForRecord } from '../lib/api';
import StoredFile from './StoredFile';

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {docs.map((d) => (
            <div key={d.ROWID} style={{ fontSize: 13 }}>
              <span className="status-badge">{d.doc_type}</span>
              <div style={{ margin: '6px 0' }}>
                <StoredFile fileId={d.file_id} alt={d.doc_type} maxHeight={120} />
              </div>
              <div className="muted small">
                {d.uploaded_by}, {d.uploaded_date}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
