import { useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Modal';
import StepGoods from '../steps/StepGoods';
import { createSupplier } from '../../../lib/api';
import { COUNTRIES } from '../../../lib/countries';
import { applyServerChanges } from '../../../lib/formSync';
import { validateRequestDates, colliMismatch, totalPackages } from '../../../lib/inboundValidation';

const TRANSPORT_TYPES = ['Sea/Ocean Freight', 'Air Freight', 'Road Freight', 'Rail Freight', 'Courier', 'Other'];
const NEW_SUPPLIER = '__new__';

// Stage 1 (Requested): Customer Details, Supplier/Transporter info, Arrival &
// Remarks, and Line Items -- everything needed to create/complete a request,
// before a manager/supervisor confirms it. Warehouse Unloading, the driver
// signature, and document uploads belong to the later Receive stage.
export default function RequestPopup({
  advice,
  lines,
  customers,
  transporters,
  suppliers,
  reloadSuppliers,
  reloadLines,
  patchAdvice,
  trackSave,
  saving,
  setError,
  onClose,
}) {
  const [form, setForm] = useState(advice);
  const [liveLines, setLiveLines] = useState(lines);
  const [otherDestination, setOtherDestination] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  const savedAdvice = useRef(advice);
  useEffect(() => {
    // take over only what changed on the server; what is being typed stays (see lib/formSync.js)
    setForm((f) => applyServerChanges(f, savedAdvice.current, advice));
    savedAdvice.current = advice;
    setOtherDestination(Boolean(advice.destination) && !COUNTRIES.includes(advice.destination));
  }, [advice]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  // Past dates are only refused while the request is still open; later
  // stages (admin edits of a finished inbound) keep their historical dates.
  const dateErrors = validateRequestDates(form, { allowPast: advice.status !== 'Requested' });
  const colliError = colliMismatch(form.expected_colli, liveLines);
  const save = (field) => () => {
    if (dateErrors[field]) return; // never store a date that breaks a rule
    if (form[field] !== advice[field]) patchAdvice({ [field]: form[field] || null });
  };
  const saveNow = (field, value) => patchAdvice({ [field]: value || null });

  const saveNewSupplier = () => {
    if (!newSupplierName.trim()) return;
    setSavingSupplier(true);
    createSupplier({ name: newSupplierName.trim(), status: 'Active' })
      .then((created) => {
        if (!created?.ROWID) throw new Error('Could not create the supplier.');
        return reloadSuppliers().then(() => {
          setAddingSupplier(false);
          setNewSupplierName('');
          setForm((f) => ({ ...f, supplier_id: created.ROWID }));
          return saveNow('supplier_id', created.ROWID);
        });
      })
      .catch((err) => setError?.(err.message || String(err)))
      .finally(() => setSavingSupplier(false));
  };

  return (
    <Modal title={advice.inbound_reference ? `Request: ${advice.inbound_reference}` : 'New Inbound Request'} onClose={onClose} wide>
      <div className="form-section-title" style={{ marginTop: 0 }}>Shipment Details</div>
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
          {colliError ? (
            <div className="error-text small">
              {colliError}{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setForm((f) => ({ ...f, expected_colli: totalPackages(liveLines) }));
                  patchAdvice({ expected_colli: totalPackages(liveLines) });
                }}
              >
                Set to {totalPackages(liveLines)}
              </button>
            </div>
          ) : (
            <p className="muted small">Must equal the total packages in the line items below.</p>
          )}
        </div>
        <div className="form-row">
          <label>Destination (Country) *</label>
          <select
            value={otherDestination ? 'Other' : (form.destination ?? '')}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'Other') {
                setOtherDestination(true);
                if (COUNTRIES.includes(form.destination)) setForm((f) => ({ ...f, destination: '' }));
              } else {
                setOtherDestination(false);
                setForm((f) => ({ ...f, destination: value }));
                saveNow('destination', value);
              }
            }}
          >
            <option value="">Select country...</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="Other">Other</option>
          </select>
          {otherDestination && (
            <input
              style={{ marginTop: 6 }}
              value={form.destination ?? ''}
              onChange={set('destination')}
              onBlur={save('destination')}
              placeholder="Enter destination"
            />
          )}
        </div>
        <div className="form-row">
          <label>Expected Arrival (ETA) *</label>
          <input type="date" value={form.expected_date ?? ''} onChange={set('expected_date')} onBlur={save('expected_date')} />
          {dateErrors.expected_date && <div className="error-text small">{dateErrors.expected_date}</div>}
        </div>
      </div>

      <div className="form-section-title">Customer &amp; Reference</div>
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

      <div className="form-section-title">Supplier &amp; Transport</div>
      <div className="form-grid-3">
        <div className="form-row">
          <label>Supplier</label>
          {addingSupplier ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="New supplier name"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveNewSupplier())}
              />
              <button type="button" className="btn secondary small-btn" onClick={saveNewSupplier} disabled={savingSupplier}>
                {savingSupplier ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() => {
                  setAddingSupplier(false);
                  setNewSupplierName('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              value={form.supplier_id ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === NEW_SUPPLIER) {
                  setAddingSupplier(true);
                  return;
                }
                set('supplier_id')({ target: { value } });
                saveNow('supplier_id', value);
              }}
            >
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.ROWID} value={s.ROWID}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SUPPLIER}>+ Add new supplier...</option>
            </select>
          )}
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

      <div className="form-section-title">Arrival &amp; Remarks</div>
      <div className="form-grid-3">
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
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label>Remarks</label>
          <textarea rows={1} value={form.remarks ?? ''} onChange={set('remarks')} onBlur={save('remarks')} placeholder="Add remarks (optional)" />
        </div>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Expected Storage Period: From</label>
          <input type="date" value={form.storage_start_date ?? ''} onChange={set('storage_start_date')} onBlur={save('storage_start_date')} />
          {dateErrors.storage_start_date && <div className="error-text small">{dateErrors.storage_start_date}</div>}
        </div>
        <div className="form-row">
          <label>Expected Storage Period: To</label>
          <input type="date" value={form.storage_end_date ?? ''} onChange={set('storage_end_date')} onBlur={save('storage_end_date')} />
          {dateErrors.storage_end_date && <div className="error-text small">{dateErrors.storage_end_date}</div>}
        </div>
      </div>
      <p className="muted small">Optional, but needed to check location availability for the full stay at the Availability Check step.</p>

      <hr className="divider" />
      <StepGoods
        advice={advice}
        lines={lines}
        reloadLines={reloadLines}
        onRowsChange={setLiveLines}
        customerId={form.customer_id}
        trackSave={trackSave}
        patchAdvice={patchAdvice}
        saving={saving}
        setError={setError}
        embedded
      />

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
