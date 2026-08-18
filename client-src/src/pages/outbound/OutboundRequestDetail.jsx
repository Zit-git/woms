import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getOutboundRequestById,
  listPickTasksByRequest,
  createPickTask,
  editPickTask,
  listAvailableCargoForCustomer,
  recordScan,
  listDispatchesByRequest,
  createDispatch,
  editOutboundRequest,
  notifyEvent,
} from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import DocumentUploader from '../../components/DocumentUploader';

export default function OutboundRequestDetail() {
  const { requestId } = useParams();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [pickTasks, setPickTasks] = useState([]);
  const [availableCargo, setAvailableCargo] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRow, setBusyRow] = useState(null); // PickTask ROWID currently being scanned
  const [showPickForm, setShowPickForm] = useState(false);
  const [pickCargoId, setPickCargoId] = useState('');
  const [savingPick, setSavingPick] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const load = () => {
    setLoading(true);
    getOutboundRequestById(requestId)
      .then((r) => {
        setRequest(r);
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

  const handleScanPick = (task) => {
    setBusyRow(task.ROWID);
    recordScan(task.cargo_id, user?.email_id || '', 'dispatch')
      .then(() => editPickTask({ ROWID: task.ROWID, status: 'Picked' }))
      .then(() => load())
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  const allPicked = pickTasks.length > 0 && pickTasks.every((t) => t.status === 'Picked');
  const alreadyDispatched = dispatches.length > 0;

  const handleConfirmDispatch = () => {
    setDispatching(true);
    createDispatch({
      outbound_request_id: requestId,
      vehicle_details: vehicleDetails,
      dispatched_by: user?.email_id || '',
      status: 'Dispatched',
    })
      .then(() => editOutboundRequest({ ROWID: requestId, status: 'Dispatched' }))
      .then(() => {
        if (request?.customer_email) {
          return notifyEvent(
            'DISPATCH_CONFIRMATION',
            request.customer_email,
            requestId,
            `Your outbound request #${requestId} has been dispatched.`,
            'Outbound Operations'
          ).catch(() => null); // notification failure shouldn't block the dispatch itself
        }
      })
      .then(() => load())
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setDispatching(false));
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!request) return <p className="error-text">Outbound request not found.</p>;

  return (
    <div>
      <Link className="link-btn" to="/outbound">
        &larr; Back to Outbound Operations
      </Link>
      <div className="toolbar">
        <h2>Outbound Request #{request.ROWID}</h2>
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

      <div className="toolbar">
        <h3>Pick Tasks</h3>
        {!showPickForm && !alreadyDispatched && (
          <button className="btn secondary" onClick={() => setShowPickForm(true)}>
            + Add Pick Line
          </button>
        )}
      </div>

      {showPickForm && (
        <form className="card" onSubmit={addPickTask}>
          <div className="form-row">
            <label>Cargo</label>
            <select value={pickCargoId} onChange={(e) => setPickCargoId(e.target.value)} required>
              <option value="">Select cargo...</option>
              {availableCargo.map((c) => (
                <option key={c.ROWID} value={c.ROWID}>
                  {c.description} ({c.qty} {c.unit}) - {c.status}
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
            <th>Cargo</th>
            <th>Qty</th>
            <th>QR Code</th>
            <th>Pick Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pickTasks.map((t) => (
            <tr key={t.ROWID}>
              <td>{t.cargo_description}</td>
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
          ))}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
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
          <button className="btn" onClick={handleConfirmDispatch} disabled={dispatching || !allPicked}>
            {dispatching ? 'Confirming...' : 'Confirm Dispatch'}
          </button>
          {!allPicked && <p className="muted small">All pick lines must be scanned & picked before dispatch.</p>}
        </div>
      )}
    </div>
  );
}
