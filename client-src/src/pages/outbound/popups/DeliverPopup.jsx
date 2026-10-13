import { useState } from 'react';
import Modal from '../../../components/Modal';
import { markCargoDelivered, logAudit } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

// Stage: the carrier has delivered; closes the loop on every Handling Unit.
export default function DeliverPopup({ request, pickTasks, setError, onClose }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const confirm = () => {
    setSaving(true);
    markCargoDelivered(pickTasks.map((t) => t.cargo_id), user?.email_id || '')
      .then(() =>
        logAudit({ userId: user?.email_id, actionType: 'DELIVERY_CONFIRMED', module: 'Outbound Operations', recordId: request.ROWID, details: { packages: pickTasks.length } })
      )
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title={`Mark delivered: ${request.outbound_reference || `#${request.ROWID}`}`} onClose={onClose}>
      <p>
        Confirm that all {pickTasks.length} Handling Unit{pickTasks.length === 1 ? '' : 's'} reached the customer.
      </p>
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={confirm} disabled={saving}>
          {saving ? 'Saving...' : 'Mark Delivered'}
        </button>
      </div>
    </Modal>
  );
}
