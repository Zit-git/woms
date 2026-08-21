import { useEffect, useState } from 'react';
import { listDocumentsForRecord } from '../../../lib/api';
import DocumentSlot from '../../../components/DocumentSlot';

const REQUIRED_TYPES = ['CMR', 'Order Confirmation', 'Photo'];

export default function StepDocuments({ advice, goNext, goBack, saving }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    listDocumentsForRecord('Inbound Operations', advice.ROWID).then((d) => {
      setDocs(d);
      setLoading(false);
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice.ROWID]);

  const hasType = (t) => docs.some((d) => d.doc_type === t);
  const needsAdrDoc = advice.adr_status === 'Yes';
  const canProceed = REQUIRED_TYPES.every(hasType) && (!needsAdrDoc || hasType('ADR Document'));

  return (
    <div className="card">
      <div className="wizard-ref-box">
        <div className="muted small" style={{ letterSpacing: 0.5 }}>
          INBOUND REFERENCE
        </div>
        <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
      </div>

      <h3>Upload Documents</h3>
      <p className="muted small">Upload all required documents for this inbound.</p>

      <div className="doc-slot-grid">
        <DocumentSlot title="Signed CMR" docType="CMR" linkedModule="Inbound Operations" linkedRecordId={advice.ROWID} variant="cmr" required onUploaded={load} />
        <DocumentSlot
          title="Order Confirmation"
          docType="Order Confirmation"
          linkedModule="Inbound Operations"
          linkedRecordId={advice.ROWID}
          variant="any"
          required
          onUploaded={load}
        />
        <DocumentSlot
          title="Photos"
          docType="Photo"
          linkedModule="Inbound Operations Photos"
          linkedRecordId={advice.ROWID}
          variant="photo"
          required
          multiple
          onUploaded={load}
        />
        <DocumentSlot title="Other" docType="Other" linkedModule="Inbound Operations" linkedRecordId={advice.ROWID} variant="any" multiple onUploaded={load} />
        {needsAdrDoc && (
          <DocumentSlot
            title="ADR Document"
            docType="ADR Document"
            linkedModule="Inbound Operations"
            linkedRecordId={advice.ROWID}
            variant="any"
            required
            onUploaded={load}
          />
        )}
      </div>

      <div className="card" style={{ background: 'var(--bg)', marginTop: 16 }}>
        <p className="muted small" style={{ margin: 0 }}>
          After confirming the documents, labels will be generated and printed for each outer package. You can print the labels on the next step.
        </p>
      </div>

      {!loading && !canProceed && <p className="muted small">Upload all required (*) documents to continue.</p>}

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn secondary" onClick={goBack}>
          &larr; Back
        </button>
        <button className="btn" onClick={goNext} disabled={!canProceed || saving}>
          Next: Verify Information &rarr;
        </button>
      </div>
    </div>
  );
}
