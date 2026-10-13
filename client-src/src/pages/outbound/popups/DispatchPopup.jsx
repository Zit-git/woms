import { useState } from 'react';
import Modal from '../../../components/Modal';
import DocumentUploader from '../../../components/DocumentUploader';
import SignaturePad from '../../../components/SignaturePad';
import { recordScan, createDispatch, editOutboundRequest, notifySafe, logAudit } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

// Stage: the goods leave. Cargo only counts as Dispatched (in transit) once
// this is confirmed, not merely when it was picked.
export default function DispatchPopup({ request, pickTasks, setError, onClose }) {
  const { user } = useAuth();
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const allPicked = pickTasks.length > 0 && pickTasks.every((t) => t.status === 'Picked');
  const checkedIn = Boolean(request.arrived_at);

  const confirm = () => {
    setDispatching(true);
    Promise.all(pickTasks.map((t) => recordScan(t.cargo_id, user?.email_id || '', 'dispatch')))
      .then(() =>
        createDispatch({
          outbound_request_id: request.ROWID,
          vehicle_details: vehicleDetails || [request.vehicle_plate, request.trailer_plate].filter(Boolean).join(' / '),
          dispatched_by: user?.email_id || '',
          status: 'Dispatched',
        })
      )
      .then(() => editOutboundRequest({ ROWID: request.ROWID, status: 'Dispatched' }))
      .then(() =>
        logAudit({ userId: user?.email_id, actionType: 'DISPATCH_CONFIRMED', module: 'Outbound Operations', recordId: request.ROWID, details: { vehicle: vehicleDetails, packages: pickTasks.length } })
      )
      .then(() => {
        // Deliberately not awaited: the dispatch is already done, and a mail
        // problem must be reported, not allowed to hold up the screen.
        if (request.customer_email) {
          notifySafe(
            'DISPATCH_CONFIRMATION',
            request.customer_email,
            request.ROWID,
            `Your outbound request #${request.ROWID} has been dispatched.`,
            'Outbound Operations'
          ).then((r) => {
            if (!r.ok) setError(`Dispatch confirmed, but the customer email could not be sent: ${r.error}`);
          });
        }
      })
      .then(onClose)
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setDispatching(false));
  };

  return (
    <Modal title={`Dispatch: ${request.outbound_reference || `#${request.ROWID}`}`} onClose={onClose} wide>
      <p className="muted small" style={{ marginTop: -8 }}>
        {pickTasks.length} Handling Unit{pickTasks.length === 1 ? '' : 's'} · Driver {request.driver_name || '—'} · Vehicle {request.vehicle_plate || '—'}
      </p>

      <DocumentUploader linkedModule="Outbound Operations" linkedRecordId={request.ROWID} bucketKey="DOCUMENTS" title="Documents (delivery note, invoice, etc.)" />
      <DocumentUploader linkedModule="Outbound Operations Photos" linkedRecordId={request.ROWID} bucketKey="CARGO_PHOTOS" title="Dispatch Photos" />
      <SignaturePad
        linkedModule="Outbound Operations Photos"
        linkedRecordId={request.ROWID}
        docType="Driver Signature (Handover)"
        title="Driver Signature (Handover)"
      />

      <div className="form-row">
        <label>Vehicle details</label>
        <input value={vehicleDetails} onChange={(e) => setVehicleDetails(e.target.value)} placeholder="e.g. Truck NL-12-AB-34" />
      </div>
      {!allPicked && <p className="muted small">All pick lines must be scanned & picked before dispatch.</p>}
      {!checkedIn && <p className="muted small">Check the driver in before dispatch.</p>}

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={confirm} disabled={dispatching || !allPicked || !checkedIn}>
          {dispatching ? 'Confirming...' : 'Confirm Dispatch'}
        </button>
      </div>
    </Modal>
  );
}
