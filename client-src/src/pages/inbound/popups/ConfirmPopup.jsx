import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { logAudit, listWarehouses, listCapacityLocations, listCapacityCargo, listCapacityOutboundCommitments, listPackageTypes, editCargo } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';
import { computeCapacity, projectAvailability, requiredCapacityByUnit, requiredWeightAndSpace } from '../../../lib/capacity';
import { recommendWarehouses } from '../../../lib/allocation';

// Stage 2 (Availability Check & Acceptance): a Warehouse Manager/Supervisor
// checks this request's required capacity against what's actually available
// (via the capacity engine) and which warehouse best fits it, then accepts
// or rejects. This request's own lines are still 'Requested', not
// 'Confirmed', so computeCapacity's Available figure naturally excludes
// them -- a clean before/after comparison.
//
// Deliberately does NOT pin a specific storage location per line here --
// in reality nobody knows exactly which rack slot something goes into until
// it has physically arrived, been checked, and turned into a Handling Unit.
// That specific-location assignment happens at Put-away time instead (see
// StoragePage.jsx), which runs the same lib/allocation.js logic but for one
// real item in hand, not a future plan. Accept only checks aggregate
// capacity and recommends a warehouse -- both legitimate decisions this
// early, unlike a specific rack.
const todayStr = () => new Date().toISOString().slice(0, 10);
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const MAX_DAYS = 60;

export default function ConfirmPopup({ advice, cargoRows, suppliers, transporters, patchAdvice, reloadCargo, onClose }) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [capacityData, setCapacityData] = useState(null); // { warehouses, locations, cargo, outboundCommitments, packageTypes }

  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, cargoRows);
  const hasStoragePeriod = Boolean(advice.storage_start_date);

  useEffect(() => {
    Promise.all([listWarehouses(), listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes()])
      .then(([warehouses, locations, cargo, outboundCommitments, packageTypes]) =>
        setCapacityData({ warehouses, locations, cargo, outboundCommitments, packageTypes })
      )
      .catch((err) => setError(err.message || String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice.warehouse_id]);

  const required = useMemo(
    () => (capacityData ? requiredCapacityByUnit(cargoRows, capacityData.packageTypes) : new Map()),
    [capacityData, cargoRows]
  );
  const requiredWeightSpace = useMemo(() => requiredWeightAndSpace(cargoRows), [cargoRows]);

  // The customer's storage interval -- every day From..To (open-ended To is
  // checked for 14 days). With no From date, falls back to today's state.
  const dates = useMemo(() => {
    if (!hasStoragePeriod) return null;
    const start = advice.storage_start_date;
    let end = advice.storage_end_date || addDays(start, 13);
    if (end < start) end = start;
    const out = [];
    for (let d = start, i = 0; d <= end && i < MAX_DAYS; d = addDays(d, 1), i += 1) out.push(d);
    return out;
  }, [hasStoragePeriod, advice.storage_start_date, advice.storage_end_date]);

  // Day-by-day availability for one warehouse, plus the *lowest* figure over
  // the whole interval -- that minimum, not today's number, is what decides
  // whether the request fits.
  const evaluateWarehouse = (warehouseId) => {
    if (!capacityData) return null;
    const base = { locations: capacityData.locations, cargoRows: capacityData.cargo, outboundCommitments: capacityData.outboundCommitments, packageTypes: capacityData.packageTypes, warehouseId };
    const rows = dates ? projectAvailability({ ...base, dates }) : [{ date: 'Today', ...computeCapacity(base) }];
    const minByUnit = new Map();
    rows.forEach((r) => r.byCapacityUnit.forEach((u) => minByUnit.set(u.capacityUnit, Math.min(minByUnit.get(u.capacityUnit) ?? Infinity, u.available))));
    const minWeight = Math.min(...rows.map((r) => r.weight.available));
    const minSpace = Math.min(...rows.map((r) => r.space.available));
    const shortUnits = [...required.entries()].filter(([unit, req]) => req > (minByUnit.get(unit) ?? 0)).map(([unit]) => unit);
    const weightShort = requiredWeightSpace.weight > minWeight;
    const spaceShort = requiredWeightSpace.spaceM3 > minSpace;
    return { rows, minByUnit, minWeight, minSpace, shortUnits, weightShort, spaceShort, fits: !shortUnits.length && !weightShort && !spaceShort };
  };

  const evaluation = useMemo(
    () => evaluateWarehouse(advice.warehouse_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capacityData, dates, required, requiredWeightSpace, advice.warehouse_id]
  );
  const warehouseEvals = useMemo(
    () => (capacityData ? new Map(capacityData.warehouses.map((w) => [String(w.ROWID), evaluateWarehouse(w.ROWID)])) : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capacityData, dates, required, requiredWeightSpace]
  );
  const unitColumns = useMemo(() => [...new Set([...required.keys(), ...(evaluation?.minByUnit.keys() || [])])].sort(), [required, evaluation]);

  // Per-line physical fit (dimensions/weight/customer dedication) per warehouse.
  const recommendation = useMemo(() => {
    if (!capacityData || !hasStoragePeriod || !capacityData.warehouses.length) return null;
    return recommendWarehouses({
      warehouses: capacityData.warehouses,
      cargoRows,
      allLocations: capacityData.locations,
      allCargo: capacityData.cargo,
      outboundCommitments: capacityData.outboundCommitments,
      packageTypes: capacityData.packageTypes,
      storageStart: advice.storage_start_date,
      storageEnd: advice.storage_end_date,
      excludeAdviceId: advice.ROWID,
      customerId: advice.customer_id,
    });
  }, [capacityData, hasStoragePeriod, cargoRows, advice.storage_start_date, advice.storage_end_date, advice.ROWID, advice.customer_id]);

  const switchWarehouse = (newWarehouseId) => {
    setSwitching(true);
    setError('');
    Promise.all(cargoRows.map((c) => editCargo({ ROWID: c.ROWID, warehouse_id: newWarehouseId })))
      .then(() => reloadCargo())
      .then(() => patchAdvice({ warehouse_id: newWarehouseId }))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSwitching(false));
  };

  const confirm = () => {
    setConfirming(true);
    setError('');
    patchAdvice({ status: 'Confirmed' })
      .then(() => logAudit({ userId: user?.email_id, actionType: 'INBOUND_CONFIRMED', module: 'Inbound Operations', recordId: advice.ROWID }))
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setConfirming(false));
  };

  const reject = () => {
    if (!rejectReason.trim()) return;
    setRejecting(true);
    setError('');
    patchAdvice({ status: 'Rejected', rejection_reason: rejectReason })
      .then(() =>
        logAudit({
          userId: user?.email_id,
          actionType: 'INBOUND_REJECTED',
          module: 'Inbound Operations',
          recordId: advice.ROWID,
          details: { reason: rejectReason },
        })
      )
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setRejecting(false));
  };

  return (
    <Modal title={`Availability Check: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      {error && <div className="error-text">{error}</div>}

      <div className="check-block">
        <div className="check-block-title">Customer</div>
        <div>{advice.customer_name}</div>
      </div>
      <div className="check-block">
        <div className="check-block-title">Destination</div>
        <div>{advice.destination || '—'}</div>
        <div className="muted small">ETA: {advice.expected_date || '—'}</div>
      </div>
      <div className="check-block">
        <div className="check-block-title">Supplier / Transporter</div>
        <div>{supplier?.name || '—'} / {transporter?.name || '—'}</div>
      </div>

      <div className="summary-strip" style={{ marginTop: 12 }}>
        <div>
          <div className="muted small">Expected Colli</div>
          <div className="summary-value">{summary.expectedColli} pcs</div>
        </div>
        <div>
          <div className="muted small">Line Items</div>
          <div className="summary-value">{cargoRows.length}</div>
        </div>
        <div>
          <div className="muted small">Total Weight</div>
          <div className="summary-value">{summary.totalWeight.toFixed(2)} kg</div>
        </div>
      </div>

      <div className="form-section-title">Warehouse</div>
      <div className="form-row" style={{ maxWidth: 320 }}>
        <label>Store this request in</label>
        <select
          value={advice.warehouse_id ?? ''}
          onChange={(e) => e.target.value && String(e.target.value) !== String(advice.warehouse_id) && switchWarehouse(e.target.value)}
          disabled={switching || !capacityData}
        >
          {!advice.warehouse_id && <option value="">Select warehouse...</option>}
          {(capacityData?.warehouses || []).map((w) => (
            <option key={w.ROWID} value={w.ROWID}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">
        Your decision — the comparison below is guidance. Changing it re-assigns every line item on this request to that warehouse.
      </p>

      <div className="form-section-title">
        Availability Check{hasStoragePeriod ? `: ${dates[0]} → ${dates[dates.length - 1]}` : ' (today only — no storage period set)'}
      </div>
      {!evaluation ? (
        <p className="muted small">Checking warehouse capacity...</p>
      ) : cargoRows.length === 0 ? (
        <p className="muted small">No line items yet to check.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  {unitColumns.map((u) => (
                    <th key={u}>{u}</th>
                  ))}
                  <th>Weight (kg)</th>
                  <th>Space (m³)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ fontWeight: 600, background: 'var(--bg)' }}>
                  <td>Required</td>
                  {unitColumns.map((u) => (
                    <td key={u}>{(required.get(u) || 0).toFixed(1)}</td>
                  ))}
                  <td>{requiredWeightSpace.weight.toFixed(1)}</td>
                  <td>{requiredWeightSpace.spaceM3.toFixed(2)}</td>
                </tr>
                {evaluation.rows.map((row) => {
                  const bad = { color: 'var(--danger)', fontWeight: 600 };
                  return (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      {unitColumns.map((u) => {
                        const avail = row.byCapacityUnit.find((e) => e.capacityUnit === u)?.available ?? 0;
                        return (
                          <td key={u} style={(required.get(u) || 0) > avail ? bad : undefined}>
                            {avail.toFixed(1)}
                          </td>
                        );
                      })}
                      <td style={requiredWeightSpace.weight > row.weight.available ? bad : undefined}>{row.weight.available.toFixed(1)}</td>
                      <td style={requiredWeightSpace.spaceM3 > row.space.available ? bad : undefined}>{row.space.available.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Each row is what this warehouse has free that day (capacity left after stock, accepted inbounds and scheduled dispatches).
            Red = less than this request needs.{' '}
            {evaluation.fits ? (
              <strong>It fits on every day of the interval.</strong>
            ) : (
              <strong style={{ color: 'var(--danger)' }}>
                ⚠ Short on at least one day:{' '}
                {[...evaluation.shortUnits, evaluation.weightShort && 'weight', evaluation.spaceShort && 'space'].filter(Boolean).join(', ')}.
              </strong>
            )}{' '}
            A shortage is a warning, not a block. Weight only counts locations with a max weight set; Space only counts locations with
            full dimensions.
          </p>
        </>
      )}

      <div className="form-section-title">Warehouse Comparison</div>
      {!capacityData ? (
        <p className="muted small">Checking warehouses...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Fits whole interval?</th>
                <th>Lines that physically fit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {capacityData.warehouses.map((warehouse) => {
                const ev = warehouseEvals.get(String(warehouse.ROWID));
                const lines = recommendation?.find((r) => String(r.warehouse.ROWID) === String(warehouse.ROWID));
                const isCurrent = String(warehouse.ROWID) === String(advice.warehouse_id);
                return (
                  <tr key={warehouse.ROWID} style={isCurrent ? { fontWeight: 600 } : undefined}>
                    <td>
                      {warehouse.name} {isCurrent && <span className="muted small">(selected)</span>}
                    </td>
                    <td>
                      {ev?.fits ? (
                        '✔ Yes'
                      ) : (
                        <span style={{ color: 'var(--danger)' }}>
                          ⚠ Short: {[...(ev?.shortUnits || []), ev?.weightShort && 'weight', ev?.spaceShort && 'space'].filter(Boolean).join(', ') || '—'}
                        </span>
                      )}
                    </td>
                    <td>{lines ? `${lines.fitCount} / ${lines.total}` : '—'}</td>
                    <td>
                      {!isCurrent && (
                        <button className="link-btn" onClick={() => switchWarehouse(warehouse.ROWID)} disabled={switching}>
                          {switching ? 'Switching...' : 'Use this warehouse'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        This is a capacity estimate, not a reservation. The exact storage location for each item is chosen later, at Put-away, once it
        has arrived.
      </p>

      {showReject ? (
        <>
          <div className="form-row">
            <label>Rejection reason *</label>
            <textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this request can't be accepted" />
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn secondary" onClick={() => setShowReject(false)} disabled={rejecting}>
              Cancel
            </button>
            <button className="btn danger" onClick={reject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Rejecting...' : 'Reject Request'}
            </button>
          </div>
        </>
      ) : (
        <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn secondary" onClick={() => setShowReject(true)} disabled={confirming}>
            Reject
          </button>
          <button className="btn" onClick={confirm} disabled={confirming}>
            {confirming ? 'Accepting...' : 'Accept Request'}
          </button>
        </div>
      )}
    </Modal>
  );
}
