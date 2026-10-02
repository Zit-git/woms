import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { logAudit, listWarehouses, listCapacityLocations, listCapacityCargo, listCapacityOutboundCommitments, listPackageTypes, editCargo } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';
import { computeCapacity, requiredCapacityByUnit, requiredWeightAndSpace } from '../../../lib/capacity';
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

  const capacitySnapshot = useMemo(
    () =>
      capacityData &&
      computeCapacity({
        locations: capacityData.locations,
        cargoRows: capacityData.cargo,
        outboundCommitments: capacityData.outboundCommitments,
        packageTypes: capacityData.packageTypes,
        warehouseId: advice.warehouse_id,
      }),
    [capacityData, advice.warehouse_id]
  );
  const required = useMemo(
    () => (capacityData ? requiredCapacityByUnit(cargoRows, capacityData.packageTypes) : new Map()),
    [capacityData, cargoRows]
  );
  const availableByUnit = new Map((capacitySnapshot?.byCapacityUnit || []).map((e) => [e.capacityUnit, e.available]));
  const allUnits = new Set([...required.keys(), ...availableByUnit.keys()]);
  const requiredWeightSpace = useMemo(() => requiredWeightAndSpace(cargoRows), [cargoRows]);

  // Which warehouse should this go to -- an aggregate, fit-count comparison
  // across warehouses (how many lines *could* fit, not which exact rack).
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
  const currentWarehouseRank = recommendation?.find((r) => String(r.warehouse.ROWID) === String(advice.warehouse_id));
  const betterWarehouse = recommendation?.find((r) => r.fitCount > (currentWarehouseRank?.fitCount ?? -1));

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

      <div className="form-section-title">Availability Check</div>
      {!capacitySnapshot ? (
        <p className="muted small">Checking warehouse capacity...</p>
      ) : allUnits.size === 0 ? (
        <p className="muted small">No line items yet to check.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Capacity Unit</th>
              <th>Required</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {[...allUnits].sort().map((unit) => {
              const req = required.get(unit) || 0;
              const avail = availableByUnit.get(unit) ?? 0;
              const short = req > avail;
              return (
                <tr key={unit}>
                  <td>{unit}</td>
                  <td>{req}</td>
                  <td style={short ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                    {avail}
                    {short && ' ⚠ short'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted small">A shortage is a warning, not a hard block — some capacity types may be approximate (see Warehouse Management → Availability).</p>

      {capacitySnapshot && (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Required</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const weightShort = requiredWeightSpace.weight > capacitySnapshot.weight.available;
              const spaceShort = requiredWeightSpace.spaceM3 > capacitySnapshot.space.available;
              return (
                <>
                  <tr>
                    <td>Weight (kg)</td>
                    <td>{requiredWeightSpace.weight.toFixed(1)}</td>
                    <td style={weightShort ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                      {capacitySnapshot.weight.available.toFixed(1)}
                      {weightShort && ' ⚠ short'}
                    </td>
                  </tr>
                  <tr>
                    <td>Space (m³)</td>
                    <td>{requiredWeightSpace.spaceM3.toFixed(2)}</td>
                    <td style={spaceShort ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                      {capacitySnapshot.space.available.toFixed(2)}
                      {spaceShort && ' ⚠ short'}
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      )}
      <p className="muted small">
        Weight only counts locations with a max weight set; Space only counts locations with full dimensions set — locations missing
        that data aren't part of either total.
      </p>

      <div className="form-section-title">Warehouse Recommendation</div>
      {!hasStoragePeriod ? (
        <p className="muted small">Set an expected storage period to compare warehouses.</p>
      ) : !recommendation ? (
        <p className="muted small">Checking warehouses...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Lines That Fit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recommendation.map(({ warehouse, fitCount, total }) => {
                  const isCurrent = String(warehouse.ROWID) === String(advice.warehouse_id);
                  return (
                    <tr key={warehouse.ROWID} style={isCurrent ? { fontWeight: 600 } : undefined}>
                      <td>
                        {warehouse.name} {isCurrent && <span className="muted small">(currently assigned)</span>}
                      </td>
                      <td>
                        {fitCount} / {total}
                      </td>
                      <td>
                        {!isCurrent && (
                          <button className="link-btn" onClick={() => switchWarehouse(warehouse.ROWID)} disabled={switching}>
                            {switching ? 'Switching...' : 'Switch to this warehouse'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {betterWarehouse && (
            <p className="muted small" style={{ color: 'var(--danger)' }}>
              ⚠ {betterWarehouse.warehouse.name} can fit more of this request ({betterWarehouse.fitCount}/{betterWarehouse.total}) than
              the currently assigned warehouse ({currentWarehouseRank?.fitCount ?? 0}/{currentWarehouseRank?.total ?? cargoRows.length}).
            </p>
          )}
          <p className="muted small">
            This is a capacity estimate, not a reservation — switching just re-assigns every line item on this request to the new
            warehouse. The exact storage location for each item is chosen later, at Put-away, once it has actually arrived.
          </p>
        </>
      )}

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
