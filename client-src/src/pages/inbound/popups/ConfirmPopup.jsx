import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { logAudit, listCapacityLocations, listCapacityCargo, listCapacityOutboundCommitments, listPackageTypes, editCargo } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';
import { computeCapacity, requiredCapacityByUnit, requiredWeightAndSpace } from '../../../lib/capacity';
import { allocateLocations } from '../../../lib/allocation';

// Stage 2 (Availability Check & Acceptance): a Warehouse Manager/Supervisor
// checks this request's required capacity against what's actually available
// in the warehouse (via the capacity engine built for the Capacity
// Dashboard), then accepts or rejects. This request's own lines are still
// 'Requested', not 'Confirmed', so computeCapacity's Available figure
// naturally excludes them -- it's a clean before/after comparison.
//
// If a storage period is set, Accept also hard-allocates a specific location
// to each cargo line (lib/allocation.js), matching size/weight/capacity and
// checking against that period -- not just an aggregate count.
export default function ConfirmPopup({ advice, cargoRows, suppliers, transporters, patchAdvice, onClose }) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [capacityData, setCapacityData] = useState(null); // { locations, cargo, outboundCommitments, packageTypes }

  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, cargoRows);
  const hasStoragePeriod = Boolean(advice.storage_start_date);

  useEffect(() => {
    Promise.all([listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes()])
      .then(([locations, cargo, outboundCommitments, packageTypes]) => setCapacityData({ locations, cargo, outboundCommitments, packageTypes }))
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

  const allocation = useMemo(() => {
    if (!capacityData || !hasStoragePeriod) return null;
    const locationsInWarehouse = capacityData.locations.filter((l) => !advice.warehouse_id || String(l.warehouse_id) === String(advice.warehouse_id));
    return allocateLocations({
      cargoRows,
      locations: locationsInWarehouse,
      allCargo: capacityData.cargo,
      outboundCommitments: capacityData.outboundCommitments,
      packageTypes: capacityData.packageTypes,
      storageStart: advice.storage_start_date,
      storageEnd: advice.storage_end_date,
      excludeAdviceId: advice.ROWID,
      customerId: advice.customer_id,
    });
  }, [capacityData, hasStoragePeriod, cargoRows, advice.warehouse_id, advice.storage_start_date, advice.storage_end_date, advice.ROWID, advice.customer_id]);

  const locationCodeById = new Map((capacityData?.locations || []).map((l) => [String(l.ROWID), l.location_code]));
  const cargoById = new Map(cargoRows.map((c) => [String(c.ROWID), c]));
  const unallocatedCount = allocation ? allocation.filter((a) => !a.locationId).length : 0;

  const confirm = () => {
    setConfirming(true);
    setError('');
    const reserve = allocation
      ? Promise.all(
          allocation.filter((a) => a.locationId).map((a) => editCargo({ ROWID: a.cargoId, reserved_location_id: a.locationId }))
        )
      : Promise.resolve();
    reserve
      .then(() => patchAdvice({ status: 'Confirmed' }))
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
      <p className="muted small">A shortage is a warning, not a hard block — some capacity types may be approximate (see the Capacity Dashboard).</p>

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

      <div className="form-section-title">Location Allocation</div>
      <p className="muted small" style={{ marginTop: -8 }}>
        Locations are customer-dedicated — once a location holds this customer's cargo, only this customer can fill the rest of it;
        locations already committed to a different customer are skipped even if they have room.
      </p>
      {!hasStoragePeriod ? (
        <p className="muted small">
          Set an expected storage period (From date) on the request to check specific location availability and reserve space.
        </p>
      ) : !allocation ? (
        <p className="muted small">Checking location availability for {advice.storage_start_date} → {advice.storage_end_date || 'open-ended'}...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Suggested Location</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map((a) => {
                  const c = cargoById.get(String(a.cargoId));
                  return (
                    <tr key={a.cargoId}>
                      <td>{c?.outer_package_no}</td>
                      <td>{c?.description}</td>
                      <td>
                        {a.locationId ? (
                          locationCodeById.get(String(a.locationId)) || a.locationId
                        ) : (
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ No location available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unallocatedCount > 0 && (
            <p className="muted small">
              {unallocatedCount} line{unallocatedCount === 1 ? '' : 's'} couldn't be matched to a location for this period — a warning, not a
              block; they'll need manual placement at Put-away.
            </p>
          )}
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
