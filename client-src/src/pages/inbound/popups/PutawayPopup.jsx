import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import {
  listCapacityLocations,
  listCapacityCargo,
  listCapacityOutboundCommitments,
  listPackageTypes,
  listAllStorageLocations,
  recordScan,
} from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeCapacity } from '../../../lib/capacity';
import { allocateLocations } from '../../../lib/allocation';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Stage: Put-away, done from inside the inbound. Shows what the warehouse
// has free right now, suggests a location for each Handling Unit (same
// allocator the Availability Check uses, for real items in hand), lets the
// operator override any of them, and stores them. Items already placed are
// shown as done, so this can be run in several sittings.
export default function PutawayPopup({ advice, cargoRows, reloadCargo, patchAdvice, onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(null); // { locations, cargo, outboundCommitments, packageTypes, locationLabels }
  const [choices, setChoices] = useState({}); // cargoId -> locationId (operator overrides)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes(), listAllStorageLocations()])
      .then(([locations, cargo, outboundCommitments, packageTypes, labelled]) =>
        setData({ locations, cargo, outboundCommitments, packageTypes, labelled })
      )
      .catch((err) => setError(err.message || String(err)));
  }, []);

  const pending = cargoRows.filter((c) => !c.current_location_id);
  const placed = cargoRows.filter((c) => c.current_location_id);

  const locationsInWarehouse = useMemo(
    () => (data ? data.locations.filter((l) => !advice.warehouse_id || String(l.warehouse_id) === String(advice.warehouse_id)) : []),
    [data, advice.warehouse_id]
  );
  const pathById = useMemo(() => new Map((data?.labelled || []).map((l) => [String(l.ROWID), `${l.location_code} (${l.path})`])), [data]);

  const availability = useMemo(
    () =>
      data &&
      computeCapacity({
        locations: data.locations,
        cargoRows: data.cargo,
        outboundCommitments: data.outboundCommitments,
        packageTypes: data.packageTypes,
        warehouseId: advice.warehouse_id,
      }),
    [data, advice.warehouse_id]
  );

  // Live suggestion per pending item (batch-aware, so two items don't get
  // the same last free slot).
  const suggestions = useMemo(() => {
    if (!data || !pending.length) return new Map();
    const result = allocateLocations({
      cargoRows: pending,
      locations: locationsInWarehouse,
      allCargo: data.cargo,
      outboundCommitments: data.outboundCommitments,
      packageTypes: data.packageTypes,
      storageStart: todayStr(),
      customerId: advice.customer_id,
    });
    return new Map(result.map((r) => [String(r.cargoId), r.locationId]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, locationsInWarehouse, cargoRows, advice.customer_id]);

  const chosenFor = (c) => choices[c.ROWID] ?? suggestions.get(String(c.ROWID)) ?? '';
  const readyToStore = pending.filter((c) => chosenFor(c));

  const store = async () => {
    setBusy(true);
    setError('');
    const results = await Promise.allSettled(readyToStore.map((c) => recordScan(c.ROWID, user?.email_id || '', 'storage', chosenFor(c))));
    const failed = results.filter((r) => r.status === 'rejected');
    try {
      await reloadCargo();
      if (failed.length) {
        setError(`${failed.length} of ${readyToStore.length} failed: ${failed[0].reason?.message || failed[0].reason}`);
      } else if (readyToStore.length === pending.length) {
        await patchAdvice({ status: 'Put Away' });
        onClose();
        return;
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Put-away: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      {error && <div className="error-text">{error}</div>}

      <div className="form-section-title" style={{ marginTop: 0 }}>Warehouse availability right now</div>
      {!availability ? (
        <p className="muted small">Checking availability...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Capacity Unit</th>
                <th>Total</th>
                <th>Occupied</th>
                <th>Available</th>
                <th>Unclaimed</th>
              </tr>
            </thead>
            <tbody>
              {availability.byCapacityUnit.map((u) => (
                <tr key={u.capacityUnit}>
                  <td>{u.capacityUnit}</td>
                  <td>{u.total}</td>
                  <td>{u.occupied.toFixed(1)}</td>
                  <td>{u.available.toFixed(1)}</td>
                  <td>{u.unclaimedAvailable.toFixed(1)}</td>
                </tr>
              ))}
              <tr>
                <td>Weight (kg)</td>
                <td>{availability.weight.total.toFixed(0)}</td>
                <td>{availability.weight.occupied.toFixed(0)}</td>
                <td>{availability.weight.available.toFixed(0)}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Space (m³)</td>
                <td>{availability.space.total.toFixed(1)}</td>
                <td>{availability.space.occupied.toFixed(1)}</td>
                <td>{availability.space.available.toFixed(1)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="form-section-title">Assign storage locations</div>
      <p className="muted small" style={{ marginTop: -8 }}>
        Suggested by size, weight and customer (locations are customer-dedicated). Change any of them before storing.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Storage Location</th>
            </tr>
          </thead>
          <tbody>
            {placed.map((c) => (
              <tr key={c.ROWID}>
                <td>{c.outer_package_no}</td>
                <td>{c.description}</td>
                <td>{c.unit}</td>
                <td>
                  <span className="status-badge status-stored">Stored</span> {pathById.get(String(c.current_location_id)) || ''}
                </td>
              </tr>
            ))}
            {pending.map((c) => {
              const suggested = suggestions.get(String(c.ROWID));
              return (
                <tr key={c.ROWID}>
                  <td>{c.outer_package_no}</td>
                  <td>{c.description}</td>
                  <td>{c.unit}</td>
                  <td>
                    <select value={chosenFor(c)} onChange={(e) => setChoices((m) => ({ ...m, [c.ROWID]: e.target.value }))} disabled={busy}>
                      <option value="">{data ? 'Select location...' : 'Loading...'}</option>
                      {(data?.labelled || [])
                        .filter((l) => locationsInWarehouse.some((w) => String(w.ROWID) === String(l.ROWID)))
                        .map((l) => (
                          <option key={l.ROWID} value={l.ROWID}>
                            {l.location_code} ({l.path})
                          </option>
                        ))}
                    </select>
                    {data && !suggested && !choices[c.ROWID] && (
                      <div style={{ color: 'var(--danger)', fontWeight: 600 }} className="small">
                        ⚠ No suitable location found — pick one manually
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {cargoRows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No handling units on this inbound.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        {pending.length === 0 ? (
          <button className="btn" onClick={() => patchAdvice({ status: 'Put Away' }).then(onClose)} disabled={busy}>
            Continue →
          </button>
        ) : (
          <button className="btn" onClick={store} disabled={busy || readyToStore.length === 0}>
            {busy ? 'Storing...' : `Store ${readyToStore.length} of ${pending.length} item${pending.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
