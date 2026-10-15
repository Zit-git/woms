import { useEffect, useRef, useState } from 'react';
import { createLine, editLine, deleteLine, listPackageTypes } from '../../../lib/api';
import { computeInboundSummary } from '../../../lib/inboundSummary';

const DEFAULT_UNIT_TYPES = ['Box', 'Carton', 'Crate', 'Pallet', 'Bag', 'Drum', 'Roll', 'Other'];

function blankLine(inboundAdviceId, customerId, warehouseId, index) {
  return {
    inbound_advice_id: inboundAdviceId,
    customer_id: customerId,
    warehouse_id: warehouseId,
    line_no: String(index + 1),
    unit: 'Box',
    description: '',
    // Numeric columns must be omitted (not '') -- Catalyst's Data Store
    // rejects an empty string for int/double columns with a 400.
    qty: 1,
  };
}

// embedded: used inline inside RequestPopup (no wizard chrome, no Back/Next
// footer -- every field already autosaves on blur/add/remove).
export default function StepGoods({ advice, lines, reloadLines, patchAdvice, goNext, goBack, saving, setError: setParentError, embedded = false, onRowsChange, customerId }) {
  const [rows, setRows] = useState(lines);
  // Lets the parent popup (Expected Colli check) see edits as they happen.
  useEffect(() => {
    onRowsChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  // Unit types come from the Package Types master so a line's capacity
  // weighting always matches a configured type.
  const [unitTypes, setUnitTypes] = useState(DEFAULT_UNIT_TYPES);
  useEffect(() => {
    listPackageTypes()
      .then((types) => {
        const names = types.map((t) => t.name).filter(Boolean);
        if (names.length) setUnitTypes(names);
      })
      .catch(() => {});
  }, []);
  // Shown inline: when embedded in a popup, the parent page's error banner
  // sits behind the modal overlay, so a failed save would otherwise be invisible.
  const [lineError, setLineError] = useState('');
  const setError = (msg) => {
    setLineError(msg);
    setParentError?.(msg);
  };
  const [savingRow, setSavingRow] = useState(null);
  const [remarks, setRemarks] = useState(advice.remarks ?? '');
  const [adrStatus, setAdrStatus] = useState(advice.adr_status ?? '');
  // Field autosaves are fire-and-forget on blur, so "Next" must wait for
  // any still in-flight ones -- otherwise the reload that follows can race
  // an unfinished save and pull stale (pre-edit) values for the review step.
  const pendingSaves = useRef([]);

  const addLine = () => {
    setLineError('');
    // The customer picked in the form counts immediately; saving it to the record can lag a moment behind.
    const customer = customerId || advice.customer_id;
    if (!customer) {
      setError('Select a customer on this request before adding line items.');
      return;
    }
    const line = blankLine(advice.ROWID, customer, advice.warehouse_id, rows.length);
    createLine(line)
      .then((saved) => {
        if (!saved?.ROWID) throw new Error('Could not add the line item.');
        setRows((r) => [...r, saved]);
      })
      .catch((err) => setError(err.message || String(err)));
  };

  const updateLocal = (rowId, field, value) => {
    setRows((r) => r.map((row) => (row.ROWID === rowId ? { ...row, [field]: value } : row)));
  };

  const saveLine = (rowId, field, value) => {
    setSavingRow(rowId);
    const promise = editLine({ ROWID: rowId, [field]: value === '' ? null : value })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => {
        setSavingRow(null);
        pendingSaves.current = pendingSaves.current.filter((p) => p !== promise);
      });
    pendingSaves.current.push(promise);
  };

  const removeLine = (rowId) => {
    deleteLine(rowId)
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

  // Surfaced as a hint only -- the wizard allows moving on before every
  // column is filled in, so users can add lines in any order and finish
  // details later.
  const requiredMissing = rows.some(
    (r) => !r.unit || !r.description || !Number(r.qty) || r.weight === null || r.weight === '' || r.weight === undefined || !r.length_cm || !r.width_cm || !r.height_cm
  );
  const showHint = rows.length === 0 || requiredMissing;

  const finishAndReload = () => Promise.allSettled(pendingSaves.current).then(() => reloadLines()).then(goNext);

  return (
    <div className={embedded ? '' : 'card'}>
      {!embedded && (
        <div className="wizard-ref-box">
          <div className="muted small" style={{ letterSpacing: 0.5 }}>
            INBOUND REFERENCE
          </div>
          <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
        </div>
      )}

      <div className="toolbar">
        <div>
          <h3 style={{ marginBottom: 2 }}>Line Items</h3>
          <p className="muted small">What the customer announced: how many packages of each type. Handling Units (pallets etc.) are created later, when the goods are received.</p>
        </div>
        <button className="btn secondary" onClick={addLine}>
          + Add Line
        </button>
      </div>

      {lineError && <div className="error-text">{lineError}</div>}

      <div className="line-items-panel">
        <table className="line-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type *</th>
              <th>Description *</th>
              <th>Qty (packages) *</th>
              <th>Weight/pkg (kg) *</th>
              <th>L (cm) *</th>
              <th>W (cm) *</th>
              <th>H (cm) *</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ROWID} className="line-item-row">
                <td>
                  <input
                    style={{ width: 50 }}
                    value={r.line_no ?? ''}
                    onChange={(e) => updateLocal(r.ROWID, 'line_no', e.target.value)}
                    onBlur={(e) => saveLine(r.ROWID, 'line_no', e.target.value)}
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
                    {[...new Set([...unitTypes, ...rows.map((r) => r.unit).filter(Boolean)])].map((u) => (
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
                  No line items yet — click "Add Line" to start.
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
          <div className="muted small">Total Packages</div>
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

      {showHint && (
        <p className="muted small">Add at least one line item and fill in all required (*) columns before completing the inbound.</p>
      )}

      {!embedded && (
        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn secondary" onClick={goBack}>
            &larr; Back
          </button>
          <button className="btn" onClick={finishAndReload} disabled={saving}>
            Next: Documents &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
