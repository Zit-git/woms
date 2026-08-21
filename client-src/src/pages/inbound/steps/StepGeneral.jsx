import { useEffect, useState } from 'react';
import { listDocumentsForRecord } from '../../../lib/api';
import DocumentSlot from '../../../components/DocumentSlot';
import SignaturePad from '../../../components/SignaturePad';

const TRANSPORT_TYPES = ['Sea/Ocean Freight', 'Air Freight', 'Road Freight', 'Rail Freight', 'Courier', 'Other'];
const COUNTRY_SUGGESTIONS = [
  'Germany', 'Netherlands', 'Belgium', 'France', 'United Kingdom', 'United States',
  'Spain', 'Italy', 'Poland', 'China', 'India', 'Other',
];

const DRIVER_SIGNATURE_DOC_TYPE = 'Driver Signature (Receiving)';

export default function StepGeneral({ advice, customers, transporters, patchAdvice, goNext, saving }) {
  const [form, setForm] = useState(advice);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => setForm(advice), [advice]);

  useEffect(() => {
    listDocumentsForRecord('Inbound Operations', advice.ROWID).then((docs) =>
      setHasSignature(docs.some((d) => d.doc_type === DRIVER_SIGNATURE_DOC_TYPE))
    );
  }, [advice.ROWID]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const save = (field) => () => {
    if (form[field] !== advice[field]) patchAdvice({ [field]: form[field] || null });
  };
  const saveNow = (field, value) => patchAdvice({ [field]: value || null });

  const required = {
    expected_colli: form.expected_colli,
    destination: form.destination,
    customer_id: form.customer_id,
    expected_date: form.expected_date,
    warehouse_unloading_date: form.warehouse_unloading_date,
    warehouse_unloading_time: form.warehouse_unloading_time,
    received_piece_count: form.received_piece_count,
    license_plate: form.license_plate,
    driver_name: form.driver_name,
  };
  const missing = Object.entries(required).filter(([, v]) => v === null || v === undefined || v === '');
  const canProceed = missing.length === 0 && hasSignature;

  return (
    <div className="card">
      <div className="wizard-ref-box">
        <div className="muted small" style={{ letterSpacing: 0.5 }}>
          INBOUND REFERENCE (AUTO-GENERATED)
        </div>
        <div className="wizard-ref-value">{advice.inbound_reference || 'Will be generated after confirmation'}</div>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Expected Colli *</label>
          <input
            type="number"
            min="0"
            value={form.expected_colli ?? ''}
            onChange={set('expected_colli')}
            onBlur={save('expected_colli')}
          />
        </div>
        <div className="form-row">
          <label>Destination (Country) *</label>
          <input
            list="country-suggestions"
            value={form.destination ?? ''}
            onChange={set('destination')}
            onBlur={save('destination')}
            placeholder="Search country or enter manually..."
          />
          <datalist id="country-suggestions">
            {COUNTRY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Customer *</label>
          <select
            value={form.customer_id ?? ''}
            onChange={(e) => {
              set('customer_id')(e);
              saveNow('customer_id', e.target.value);
            }}
          >
            <option value="">Select customer...</option>
            {customers.map((c) => (
              <option key={c.ROWID} value={c.ROWID}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Customer Reference / PO Number</label>
          <input value={form.reference_number ?? ''} onChange={set('reference_number')} onBlur={save('reference_number')} placeholder="PO / Order / Reference number" />
        </div>
        <div className="form-row">
          <label>Reference Client</label>
          <input value={form.reference_client ?? ''} onChange={set('reference_client')} onBlur={save('reference_client')} placeholder="Your reference (optional)" />
        </div>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Supplier</label>
          <select
            value={form.supplier_id ?? ''}
            onChange={(e) => {
              set('supplier_id')(e);
              saveNow('supplier_id', e.target.value);
            }}
          >
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.ROWID} value={c.ROWID}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Carrier / Transporter</label>
          <select
            value={form.transporter_id ?? ''}
            onChange={(e) => {
              set('transporter_id')(e);
              saveNow('transporter_id', e.target.value);
            }}
          >
            <option value="">None</option>
            {transporters.map((t) => (
              <option key={t.ROWID} value={t.ROWID}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>CMR (Freight Document) Number</label>
          <input value={form.cmr_number ?? ''} onChange={set('cmr_number')} onBlur={save('cmr_number')} placeholder="Enter CMR number" />
        </div>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Expected Arrival (ETA) *</label>
          <input type="date" value={form.expected_date ?? ''} onChange={set('expected_date')} onBlur={save('expected_date')} />
        </div>
        <div className="form-row">
          <label>Transport Type</label>
          <select
            value={form.transport_type ?? ''}
            onChange={(e) => {
              set('transport_type')(e);
              saveNow('transport_type', e.target.value);
            }}
          >
            <option value="">Select type</option>
            {TRANSPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Remarks</label>
          <textarea rows={1} value={form.remarks ?? ''} onChange={set('remarks')} onBlur={save('remarks')} placeholder="Add remarks (optional)" />
        </div>
      </div>

      <hr className="divider" />
      <h3>Warehouse Unloading Information</h3>
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

      <SignaturePad
        linkedModule="Inbound Operations"
        linkedRecordId={advice.ROWID}
        docType={DRIVER_SIGNATURE_DOC_TYPE}
        title="Driver Signature * — by signing, the driver confirms delivery of the goods"
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
        <p className="muted small">Fill in all required (*) fields{!hasSignature ? ' and capture the driver signature' : ''} to continue.</p>
      )}

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={goNext} disabled={!canProceed || saving}>
          Next: Line Items &rarr;
        </button>
      </div>
    </div>
  );
}
