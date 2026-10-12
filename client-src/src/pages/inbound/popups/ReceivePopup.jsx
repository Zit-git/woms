import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import DocumentSlot from '../../../components/DocumentSlot';
import SignaturePad from '../../../components/SignaturePad';
import { editLine, listDocumentsForRecord } from '../../../lib/api';

const DRIVER_SIGNATURE_DOC_TYPE = 'Driver Signature (Receiving)';

// Stage 3 (Received): physical arrival -- the warehouse checks the items,
// records what was actually received (which may differ from what was
// requested), captures the driver's signature, and uploads documents/photos.
export default function ReceivePopup({ advice, lines, patchAdvice, reloadLines, onClose, setError }) {
  const [form, setForm] = useState(advice);
  const [rows, setRows] = useState(lines.map((r) => ({ ...r, received_qty: r.received_qty ?? r.qty ?? '' })));
  const [hasSignature, setHasSignature] = useState(false);
  const [marking, setMarking] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => setForm(advice), [advice]);
  useEffect(() => setRows(lines.map((r) => ({ ...r, received_qty: r.received_qty ?? r.qty ?? '' }))), [lines]);

  useEffect(() => {
    listDocumentsForRecord('Inbound Operations', advice.ROWID).then((docs) =>
      setHasSignature(docs.some((d) => d.doc_type === DRIVER_SIGNATURE_DOC_TYPE))
    );
  }, [advice.ROWID]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const save = (field) => () => {
    if (form[field] !== advice[field]) patchAdvice({ [field]: form[field] || null });
  };

  const updateReceivedQty = (rowId, value) => setRows((r) => r.map((row) => (row.ROWID === rowId ? { ...row, received_qty: value } : row)));
  const saveReceivedQty = (rowId, value) =>
    editLine({ ROWID: rowId, received_qty: value === '' ? null : value }).catch((err) => setError?.(err.message || String(err)));

  const required = {
    warehouse_unloading_date: form.warehouse_unloading_date,
    warehouse_unloading_time: form.warehouse_unloading_time,
    received_piece_count: form.received_piece_count,
    license_plate: form.license_plate,
    driver_name: form.driver_name,
  };
  const missing = Object.entries(required).filter(([, v]) => v === null || v === undefined || v === '');

  const markReceived = () => {
    setMarking(true);
    setLocalError('');
    Promise.allSettled(rows.map((r) => editLine({ ROWID: r.ROWID, received_qty: r.received_qty === '' ? 0 : Number(r.received_qty) })))
      .then((results) => {
        // Don't move on to "Received" if any received quantity failed to save.
        const failed = results.find((r) => r.status === 'rejected');
        if (failed) throw new Error(`Could not save the received quantities: ${failed.reason?.message || failed.reason}`);
      })
      .then(() => reloadLines())
      .then(() => patchAdvice({ status: 'Received' }))
      .then(onClose)
      .catch((err) => {
        setLocalError(err.message || String(err));
        setError?.(err.message || String(err));
      })
      .finally(() => setMarking(false));
  };

  return (
    <Modal title={`Receive: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      {localError && <div className="error-text">{localError}</div>}
      <div className="form-section-title" style={{ marginTop: 0 }}>Warehouse Unloading Information</div>
      <div className="form-grid-3">
        <div className="form-row">
          <label>Warehouse Unloading Date *</label>
          <input
            type="date"
            value={form.warehouse_unloading_date ?? ''}
            onChange={set('warehouse_unloading_date')}
            onBlur={save('warehouse_unloading_date')}
          />
        </div>
        <div className="form-row">
          <label>Warehouse Unloading Time *</label>
          <input
            type="time"
            value={form.warehouse_unloading_time ?? ''}
            onChange={set('warehouse_unloading_time')}
            onBlur={save('warehouse_unloading_time')}
          />
        </div>
        <div className="form-row">
          <label>Received Piece Count *</label>
          <input
            type="number"
            min="0"
            value={form.received_piece_count ?? ''}
            onChange={set('received_piece_count')}
            onBlur={save('received_piece_count')}
          />
          {form.received_piece_count !== null && form.received_piece_count !== undefined && form.received_piece_count !== '' &&
            Number(form.received_piece_count) !== rows.reduce((sum, r) => sum + (Number(r.received_qty) || 0), 0) && (
              <div className="error-text small">
                Differs from the received quantities below ({rows.reduce((sum, r) => sum + (Number(r.received_qty) || 0), 0)}).
              </div>
            )}
        </div>
      </div>
      <div className="form-grid-3">
        <div className="form-row">
          <label>Plate / License Plate *</label>
          <input value={form.license_plate ?? ''} onChange={set('license_plate')} onBlur={save('license_plate')} />
        </div>
        <div className="form-row">
          <label>Driver Name *</label>
          <input value={form.driver_name ?? ''} onChange={set('driver_name')} onBlur={save('driver_name')} />
        </div>
      </div>

      <hr className="divider" />
      <div className="form-section-title" style={{ marginTop: 0 }}>Received Quantities</div>
      <p className="muted small" style={{ marginTop: -8 }}>Enter how many packages of each line actually arrived. Handling Units are created from these in the next step.</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Requested Qty</th>
              <th>Received Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ROWID}>
                <td>{r.line_no}</td>
                <td>{r.description}</td>
                <td>{r.unit}</td>
                <td>{r.qty || '—'}</td>
                <td>
                  <input
                    type="number"
                    style={{ width: 90 }}
                    value={r.received_qty ?? ''}
                    onChange={(e) => updateReceivedQty(r.ROWID, e.target.value)}
                    onBlur={(e) => saveReceivedQty(r.ROWID, e.target.value)}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No line items on this inbound.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <hr className="divider" />
      <div className="form-section-title" style={{ marginTop: 0 }}>Confirm &amp; Attach</div>
      <SignaturePad
        embedded
        linkedModule="Inbound Operations"
        linkedRecordId={advice.ROWID}
        docType={DRIVER_SIGNATURE_DOC_TYPE}
        title="Driver Signature * — by signing, the driver confirms delivery of the goods"
        onSaved={() => setHasSignature(true)}
      />

      <div className="doc-slot-grid">
        <DocumentSlot title="CMR Upload (Photo)" docType="CMR" linkedModule="Inbound Operations" linkedRecordId={advice.ROWID} variant="cmr" />
        <DocumentSlot
          title="Additional Photos (Optional)"
          docType="Photo"
          linkedModule="Inbound Operations Photos"
          linkedRecordId={advice.ROWID}
          variant="photo"
          multiple
        />
      </div>

      {missing.length > 0 && (
        <p className="muted small">Fill in all required (*) fields{!hasSignature ? ' and capture the driver signature' : ''} before marking as received.</p>
      )}

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={markReceived} disabled={marking || missing.length > 0 || !hasSignature}>
          {marking ? 'Saving...' : 'Mark as Received'}
        </button>
      </div>
    </Modal>
  );
}
