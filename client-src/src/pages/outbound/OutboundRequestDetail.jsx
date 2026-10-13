import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getOutboundRequestById,
  listPickTasksByRequest,
  createPickTask,
  editPickTask,
  listAvailableCargoForCustomer,
  recordScan,
  listDispatchesByRequest,
  listAllStorageLocations,
  createDispatch,
  editOutboundRequest,
  notifySafe,
  logAudit,
  markCargoDelivered,
  checkInPickup,
} from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import DocumentUploader from '../../components/DocumentUploader';
import RecordTasks from '../../components/RecordTasks';
import SignaturePad from '../../components/SignaturePad';
import AuditTrail from '../../components/AuditTrail';

const QrScannerModal = lazy(() => import('../../components/QrScannerModal'));

export default function OutboundRequestDetail() {
  const { requestId } = useParams();
  const { user, canAccessWarehouse } = useAuth();
  const [request, setRequest] = useState(null);
  const [pickTasks, setPickTasks] = useState([]);
  const [availableCargo, setAvailableCargo] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [locations, setLocations] = useState(() => new Map()); // location id -> { code, path }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRow, setBusyRow] = useState(null); // PickTask ROWID currently being scanned
  const [showPickForm, setShowPickForm] = useState(false);
  const [pickCargoId, setPickCargoId] = useState('');
  const [savingPick, setSavingPick] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [checkIn, setCheckIn] = useState({ driver_name: '', driver_id_number: '', driver_phone: '', vehicle_plate: '', trailer_plate: '' });
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);

  const load = () => {
    setLoading(true);
    getOutboundRequestById(requestId)
      .then((r) => {
        setRequest(r);
        if (r) {
          setCheckIn({
            driver_name: r.driver_name || '',
            driver_id_number: r.driver_id_number || '',
            driver_phone: r.driver_phone || '',
            vehicle_plate: r.vehicle_plate || '',
            trailer_plate: r.trailer_plate || '',
          });
        }
        return Promise.all([
          listPickTasksByRequest(requestId),
          r ? listAvailableCargoForCustomer(r.customer_id) : [],
          listDispatchesByRequest(requestId),
        ]);
      })
      .then(([tasks, cargo, disp]) => {
        setPickTasks(tasks);
        const pickedCargoIds = new Set(tasks.map((t) => String(t.cargo_id)));
        setAvailableCargo(cargo.filter((c) => !pickedCargoIds.has(String(c.ROWID))));
        setDispatches(disp);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [requestId]);
  useEffect(() => {
    listAllStorageLocations()
      .then((list) => setLocations(new Map(list.map((l) => [String(l.ROWID), { code: l.location_code, path: l.path }]))))
      .catch(() => {});
  }, []);

  // Fetch order: what still has to be picked first, walking the warehouse by location code; picked lines last.
  const orderedTasks = [...pickTasks].sort((a, b) => {
    if ((a.status === 'Picked') !== (b.status === 'Picked')) return a.status === 'Picked' ? 1 : -1;
    const codeA = locations.get(String(a.cargo_location_id))?.code || '\uffff';
    const codeB = locations.get(String(b.cargo_location_id))?.code || '\uffff';
    return codeA.localeCompare(codeB, undefined, { numeric: true });
  });
  const pickedCount = pickTasks.filter((t) => t.status === 'Picked').length;

  const addPickTask = (e) => {
    e.preventDefault();
    if (!pickCargoId) return;
    setSavingPick(true);
    createPickTask({
      outbound_request_id: requestId,
      cargo_id: pickCargoId,
      assigned_to: user?.email_id || '',
      status: 'Assigned',
    })
      .then(() => {
        setShowPickForm(false);
        setPickCargoId('');
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSavingPick(false));
  };

  const checkedIn = Boolean(request?.arrived_at);
  const submitCheckIn = (e) => {
    e.preventDefault();
    if (!checkIn.driver_name.trim() || !checkIn.vehicle_plate.trim()) {
      setError('Enter the driver name and the vehicle plate to check the driver in.');
      return;
    }
    setSavingCheckIn(true);
    setError('');
    checkInPickup(requestId, checkIn, user?.email_id || '')
      .then(() => {
        setEditingCheckIn(false);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSavingCheckIn(false));
  };

  const handleScanPick = (task) => {
    setBusyRow(task.ROWID);
    recordScan(task.cargo_id, user?.email_id || '', 'pick')
      .then(() => editPickTask({ ROWID: task.ROWID, status: 'Picked' }))
      .then(() => load())
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  const handleScanned = useCallback(
    (decodedText) => {
      setShowScanner(false);
      const match = pickTasks.find((t) => t.cargo_qr_code === decodedText && t.status !== 'Picked');
      if (match) {
        handleScanPick(match);
      } else {
        setError(`No pending pick line matches scanned code "${decodedText}"`);
      }
    },
    [pickTasks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const allPicked = pickTasks.length > 0 && pickTasks.every((t) => t.status === 'Picked');
  const alreadyDispatched = dispatches.length > 0;
  const allDelivered = pickTasks.length > 0 && pickTasks.every((t) => t.cargo_status === 'Delivered');

  const handleMarkDelivered = () => {
    setMarkingDelivered(true);
    markCargoDelivered(pickTasks.map((t) => t.cargo_id), user?.email_id || '')
      .then(() =>
        logAudit({ userId: user?.email_id, actionType: 'DELIVERY_CONFIRMED', module: 'Outbound Operations', recordId: requestId, details: { packages: pickTasks.length } })
      )
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setMarkingDelivered(false));
  };

  const handleConfirmDispatch = () => {
    setDispatching(true);
    // Cargo only counts as Dispatched (in transit) once the dispatch is confirmed,
    // not merely when it was picked.
    Promise.all(pickTasks.map((t) => recordScan(t.cargo_id, user?.email_id || '', 'dispatch')))
      .then(() =>
        createDispatch({
          outbound_request_id: requestId,
          vehicle_details: vehicleDetails || [request.vehicle_plate, request.trailer_plate].filter(Boolean).join(' / '),
          dispatched_by: user?.email_id || '',
          status: 'Dispatched',
        })
      )
      .then(() => editOutboundRequest({ ROWID: requestId, status: 'Dispatched' }))
      .then(() =>
        logAudit({ userId: user?.email_id, actionType: 'DISPATCH_CONFIRMED', module: 'Outbound Operations', recordId: requestId, details: { vehicle: vehicleDetails, packages: pickTasks.length } })
      )
      .then(() => {
        // Deliberately not awaited: the dispatch is already done, and a mail
        // problem must be reported, not allowed to hold up the screen.
        if (request?.customer_email) {
          notifySafe(
            'DISPATCH_CONFIRMATION',
            request.customer_email,
            requestId,
            `Your outbound request #${requestId} has been dispatched.`,
            'Outbound Operations'
          ).then((r) => {
            if (!r.ok) setError(`Dispatch confirmed, but the customer email could not be sent: ${r.error}`);
          });
        }
      })
      .then(() => load())
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setDispatching(false));
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!request) return <p className="error-text">Outbound request not found.</p>;
  if (!canAccessWarehouse(request.warehouse_id)) {
    return <p className="error-text">You don't have access to this warehouse's records.</p>;
  }

  return (
    <div>
      <Link className="link-btn" to="/outbound">
        &larr; Back to Outbound Operations
      </Link>
      <div className="toolbar">
        <h2>
          {request.outbound_reference || `Outbound Request #${request.ROWID}`}
          {request.reference_number && <span className="muted small"> (customer ref {request.reference_number})</span>}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/pickup/${requestId}`} target="_blank" rel="noreferrer">
            Print Pickup Pass
          </a>
          <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/outbound/${requestId}`} target="_blank" rel="noreferrer">
            Print Dispatch Note
          </a>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <p>
          <strong>Customer:</strong> {request.customer_name}
        </p>
        <p>
          <strong>Requested date:</strong> {request.requested_date}
        </p>
        <p>
          <strong>Status:</strong> <span className="status-badge">{request.status}</span>
        </p>
      </div>

      <div className="card">
        <h3>Pickup check-in</h3>
        <p className="muted small" style={{ marginTop: -8 }}>
          Expected carrier: <strong>{request.transporter_name || 'not specified'}</strong> · Pickup reference <strong>{request.outbound_reference || '—'}</strong>.
          Check the driver's ID and the pass before anything is loaded.
        </p>
        {checkedIn && !editingCheckIn ? (
          <>
            <div>
              <span className="status-badge">Checked in</span> {request.arrived_at} by {request.checked_in_by || '—'}
            </div>
            <div className="muted small" style={{ margin: '6px 0' }}>
              Driver: {request.driver_name || '—'} (ID {request.driver_id_number || '—'}, {request.driver_phone || 'no phone'}) · Vehicle: {request.vehicle_plate || '—'}
              {request.trailer_plate ? ` / trailer ${request.trailer_plate}` : ''}
            </div>
            {!alreadyDispatched && (
              <button className="link-btn" onClick={() => setEditingCheckIn(true)}>
                Edit
              </button>
            )}
          </>
        ) : alreadyDispatched ? (
          <p className="muted small">No check-in was recorded for this pickup.</p>
        ) : (
          <form onSubmit={submitCheckIn}>
            <div className="form-grid-3">
              <div className="form-row">
                <label>Driver name *</label>
                <input value={checkIn.driver_name} onChange={(e) => setCheckIn({ ...checkIn, driver_name: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Driver ID number</label>
                <input value={checkIn.driver_id_number} onChange={(e) => setCheckIn({ ...checkIn, driver_id_number: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Driver phone</label>
                <input value={checkIn.driver_phone} onChange={(e) => setCheckIn({ ...checkIn, driver_phone: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Vehicle plate *</label>
                <input value={checkIn.vehicle_plate} onChange={(e) => setCheckIn({ ...checkIn, vehicle_plate: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Trailer plate</label>
                <input value={checkIn.trailer_plate} onChange={(e) => setCheckIn({ ...checkIn, trailer_plate: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingCheckIn}>
                {savingCheckIn ? 'Saving...' : checkedIn ? 'Save changes' : 'Check driver in'}
              </button>
              {checkedIn && (
                <button className="btn secondary" type="button" onClick={() => setEditingCheckIn(false)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <DocumentUploader
        linkedModule="Outbound Operations"
        linkedRecordId={requestId}
        bucketKey="DOCUMENTS"
        title="Documents (delivery note, invoice, etc.)"
      />
      <DocumentUploader
        linkedModule="Outbound Operations Photos"
        linkedRecordId={requestId}
        bucketKey="CARGO_PHOTOS"
        title="Dispatch Photos"
      />
      <SignaturePad
        linkedModule="Outbound Operations Photos"
        linkedRecordId={requestId}
        docType="Driver Signature (Handover)"
        title="Driver Signature (Handover)"
      />

      <RecordTasks moduleRef="Outbound Operations" recordRefId={requestId} />

      <div className="toolbar">
        <h3>
          Pick Tasks
          {pickTasks.length > 0 && (
            <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>
              {pickedCount} of {pickTasks.length} picked
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {!alreadyDispatched && pickTasks.some((t) => t.status !== 'Picked') && (
            <button className="btn secondary" onClick={() => setShowScanner(true)}>
              Scan to Pick
            </button>
          )}
          {!showPickForm && !alreadyDispatched && (
            <button className="btn secondary" onClick={() => setShowPickForm(true)}>
              + Add Pick Line
            </button>
          )}
        </div>
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <QrScannerModal onDecode={handleScanned} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {showPickForm && (
        <form className="card" onSubmit={addPickTask}>
          <div className="form-row">
            <label>Cargo</label>
            <select value={pickCargoId} onChange={(e) => setPickCargoId(e.target.value)} required>
              <option value="">Select cargo...</option>
              {availableCargo.map((c) => (
                <option key={c.ROWID} value={c.ROWID}>
                  {[
                    c.description || 'Package',
                    c.outer_package_no && `#${c.outer_package_no}`,
                    c.unit && (c.qty ? `${c.qty} ${c.unit}` : c.unit),
                    c.inbound_reference,
                    c.location_code ? `in ${c.location_code}` : c.status,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={savingPick || !availableCargo.length}>
              {savingPick ? 'Saving...' : 'Add'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowPickForm(false)}>
              Cancel
            </button>
          </div>
          {!availableCargo.length && <p className="muted small">No available cargo for this customer to pick.</p>}
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Fetch from</th>
            <th>Cargo</th>
            <th>From inbound</th>
            <th>Qty</th>
            <th>QR Code</th>
            <th>Pick Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderedTasks.map((t) => {
            const loc = locations.get(String(t.cargo_location_id));
            return (
            <tr key={t.ROWID}>
              <td>
                {t.status === 'Picked' ? (
                  <span className="muted small">Picked</span>
                ) : loc ? (
                  <>
                    <strong>{loc.code}</strong>
                    <div className="muted small">{loc.path}</div>
                  </>
                ) : (
                  <span className="muted small">Not in a rack: at the dock</span>
                )}
              </td>
              <td>
                {t.cargo_hu_no ? <strong>HU {t.cargo_hu_no}</strong> : null} {t.cargo_description}
              </td>
              <td>
                {t.inbound_advice_id ? <Link className="link-btn" to={`/inbound/${t.inbound_advice_id}`}>{t.inbound_reference || `#${t.inbound_advice_id}`}</Link> : <span className="muted">—</span>}
              </td>
              <td>
                {t.cargo_qty} {t.cargo_unit}
              </td>
              <td>{t.cargo_qr_code || <span className="muted">Not generated</span>}</td>
              <td>
                <span className="status-badge">{t.status}</span>
              </td>
              <td>
                {t.status !== 'Picked' && (
                  <button className="link-btn" disabled={busyRow === t.ROWID} onClick={() => handleScanPick(t)}>
                    {busyRow === t.ROWID ? 'Scanning...' : 'Scan & Pick'}
                  </button>
                )}
              </td>
            </tr>
            );
          })}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No pick lines added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="toolbar">
        <h3>Dispatch</h3>
      </div>

      {alreadyDispatched ? (
        <div className="card">
          <strong>Dispatched.</strong>
          {dispatches.map((d) => (
            <div key={d.ROWID} className="muted small">
              By {d.dispatched_by} on {d.dispatch_date} {d.vehicle_details && `- ${d.vehicle_details}`}
            </div>
          ))}
          {allDelivered ? (
            <p className="status-badge" style={{ marginTop: 10 }}>
              Delivered
            </p>
          ) : (
            <button className="btn" style={{ marginTop: 10 }} onClick={handleMarkDelivered} disabled={markingDelivered}>
              {markingDelivered ? 'Saving...' : 'Mark Delivered'}
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="form-row">
            <label>Vehicle details</label>
            <input
              value={vehicleDetails}
              onChange={(e) => setVehicleDetails(e.target.value)}
              placeholder="e.g. Truck NL-12-AB-34"
            />
          </div>
          <button className="btn" onClick={handleConfirmDispatch} disabled={dispatching || !allPicked || !checkedIn}>
            {dispatching ? 'Confirming...' : 'Confirm Dispatch'}
          </button>
          {!allPicked && <p className="muted small">All pick lines must be scanned & picked before dispatch.</p>}
          {!checkedIn && <p className="muted small">Check the driver in (above) before dispatch.</p>}
        </div>
      )}

      <AuditTrail modules={['Outbound Operations', 'Outbound Operations Photos']} recordId={requestId} />
    </div>
  );
}
