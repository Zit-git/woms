import { useRef, useState } from 'react';
import { createCargo, editCargo, deleteCargo } from '../../../lib/api';
import { computeInboundSummary } from '../../../lib/inboundSummary';

const UNIT_TYPES = ['Box', 'Crate', 'Pallet', 'Bag', 'Drum', 'Other'];

function blankLine(inboundAdviceId, customerId, warehouseId, index) {
  return {
    inbound_advice_id: inboundAdviceId,
    customer_id: customerId,
    warehouse_id: warehouseId,
    outer_package_no: String(index + 1),
    unit: 'Box',
    description: '',
    // Numeric columns must be omitted (not '') -- Catalyst's Data Store
    // rejects an empty string for int/double columns with a 400.
    status: 'Received',
  };
}

export default function StepGoods({ advice, cargoRows, reloadCargo, patchAdvice, goNext, goBack, saving, setError }) {
  const [rows, setRows] = useState(cargoRows);
  const [savingRow, setSavingRow] = useState(null);
  const [remarks, setRemarks] = useState(advice.remarks ?? '');
  const [adrStatus, setAdrStatus] = useState(advice.adr_status ?? '');
  // Field autosaves are fire-and-forget on blur, so "Next" must wait for
  // any still in-flight ones -- otherwise the reload that follows can race
  // an unfinished save and pull stale (pre-edit) values for the review step.
  const pendingSaves = useRef([]);

  const addLine = () => {
    const line = blankLine(advice.ROWID, advice.customer_id, advice.warehouse_id, rows.length);
    createCargo(line)
      .then((saved) => {
        if (!saved?.ROWID) throw new Error('Could not add the cargo line.');
        setRows((r) => [...r, saved]);
      })
      .catch((err) => setError(err.message || String(err)));
  };

  const updateLocal = (rowId, field, value) => {
    setRows((r) => r.map((row) => (row.ROWID === rowId ? { ...row, [field]: value } : row)));
  };

  const saveLine = (rowId, field, value) => {
    setSavingRow(rowId);
    const promise = editCargo({ ROWID: rowId, [field]: value === '' ? null : value })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => {
        setSavingRow(null);
        pendingSaves.current = pendingSaves.current.filter((p) => p !== promise);
      });
    pendingSaves.current.push(promise);
  };

  const removeLine = (rowId) => {
    deleteCargo(rowId)
      .then(() => setRows((r) => r.filter((row) => row.ROWID !== rowId)))
      .catch((err) => setError(err.message || String(err)));
  };

  const saveRemarks = () => {
    if (remarks !== (advice.remarks ?? '')) patchAdvice({ remarks: remarks || null });
  };
  const saveAdr = (value) => {
    setAdrStatus(value);
    patchAdvice({ adr_status: value || null });
  };

  const summary = computeInboundSummary({ ...advice, remarks }, rows);

  const requiredMissing = rows.some(
    (r) => !r.unit || !r.description || r.weight === null || r.weight === '' || r.weight === undefined || !r.length_cm || !r.width_cm || !r.height_cm
  );
  const canProceed = rows.length > 0 && !requiredMissing;

  const finishAndReload = () => Promise.allSettled(pendingSaves.current).then(() => reloadCargo()).then(goNext);

  return (
    <div className="card">
      <div className="wizard-ref-box">
        <div className="muted small" style={{ letterSpacing: 0.5 }}>
          INBOUND REFERENCE
        </div>
        <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
      </div>

      <div className="toolbar">
        <div>
          <h3 style={{ marginBottom: 2 }}>Line Items</h3>
          <p className="muted small">Add every cargo line (box/crate/pallet) received in this inbound.</p>
        </div>
        <button className="btn secondary" onClick={addLine}>
          + Add Line
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type *</th>
              <th>Description *</th>
              <th>Qty (Inner, optional)</th>
              <th>Weight/pkg (kg) *</th>
              <th>L (cm) *</th>
              <th>W (cm) *</th>
              <th>H (cm) *</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ROWID}>
                <td>
                  <input
                    style={{ width: 50 }}
                    value={r.outer_package_no ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'outer_package_no', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'outer_package_no', e.target.value)}
                  />
                </td>
                <td>
                  <select
                    value={r.unit ?? ''}
                    onChange={(e) => {
                      updateLocal(r.ROWID, 'unit', e.target.value);
                      saveLine(r.ROWID, 'unit', e.target.value);
                    }}
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={r.description ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'description', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'description', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 90 }}
                    value={r.qty ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'qty', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'qty', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 90 }}
                    value={r.weight ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'weight', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'weight', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={r.length_cm ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'length_cm', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'length_cm', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={r.width_cm ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'width_cm', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'width_cm', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={r.height_cm ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'height_cm', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'height_cm', e.target.value)}
                  />
                </td>
                <td>
                  <button className="link-btn" onClick={() => removeLine(r.ROWID)} disabled={savingRow === r.ROWID}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No cargo lines yet — click "Add Line" to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-grid-3">
        <div className="form-row">
          <label>Remarks</label>
          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} onBlur={saveRemarks} placeholder="Add remarks (optional)" />
        </div>
        <div className="form-row">
          <label>ADR (Dangerous Goods)</label>
          <select value={adrStatus} onChange={(e) => saveAdr(e.target.value)}>
            <option value="">Select ADR status</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          <p className="muted small">If applicable, select the ADR status of this inbound.</p>
        </div>
      </div>

      <div className="summary-strip">
        <div>
          <div className="muted small">Expected Colli</div>
          <div className="summary-value">{summary.expectedColli} pcs</div>
        </div>
        <div>
          <div className="muted small">Received Pieces (Inner)</div>
          <div className="summary-value">{summary.receivedPieces} pcs</div>
        </div>
        <div>
          <div className="muted small">Total Outer Packages</div>
          <div className="summary-value">{summary.totalOuterPackages}</div>
        </div>
        <div>
          <div className="muted small">Total Weight</div>
          <div className="summary-value">{summary.totalWeight.toFixed(2)} kg</div>
        </div>
        <div>
          <div className="muted small">Total Volume</div>
          <div className="summary-value">{summary.totalVolume.toFixed(3)} m³</div>
        </div>
      </div>

      {!canProceed && (
        <p className="muted small">Add at least one cargo line and fill in all required (*) columns to continue.</p>
      )}

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn secondary" onClick={goBack}>
          &larr; Back
        </button>
        <button className="btn" onClick={finishAndReload} disabled={!canProceed || saving}>
          Next: Documents &rarr;
        </button>
      </div>
    </div>
  );
}
