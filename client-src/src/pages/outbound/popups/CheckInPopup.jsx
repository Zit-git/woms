import { useState } from 'react';
import Modal from '../../../components/Modal';
import { checkInPickup } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

// Stage: the driver arrives. Check the ID and the Pickup Pass before anything is loaded.
export default function CheckInPopup({ request, setError, onClose }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    driver_name: request.driver_name || '',
    driver_id_number: request.driver_id_number || '',
    driver_phone: request.driver_phone || '',
    vehicle_plate: request.vehicle_plate || '',
    trailer_plate: request.trailer_plate || '',
  });
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.driver_name.trim() || !form.vehicle_plate.trim()) {
      setLocalError('Enter the driver name and the vehicle plate to check the driver in.');
      return;
    }
    setSaving(true);
    setLocalError('');
    checkInPickup(request.ROWID, form, user?.email_id || '')
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title={`Driver check-in: ${request.outbound_reference || `#${request.ROWID}`}`} onClose={onClose}>
      <p className="muted small" style={{ marginTop: -8 }}>
        Expected carrier: <strong>{request.transporter_name || 'not specified'}</strong> · Pickup reference{' '}
        <strong>{request.outbound_reference || '—'}</strong>. Check the driver's ID and the pass before anything is loaded.
      </p>
      {localError && <div className="error-text">{localError}</div>}
      <form onSubmit={submit}>
        <div className="form-grid-3">
          <div className="form-row">
            <label>Driver name *</label>
            <input value={form.driver_name} onChange={set('driver_name')} />
          </div>
          <div className="form-row">
            <label>Driver ID number</label>
            <input value={form.driver_id_number} onChange={set('driver_id_number')} />
          </div>
          <div className="form-row">
            <label>Driver phone</label>
            <input value={form.driver_phone} onChange={set('driver_phone')} />
          </div>
          <div className="form-row">
            <label>Vehicle plate *</label>
            <input value={form.vehicle_plate} onChange={set('vehicle_plate')} />
          </div>
          <div className="form-row">
            <label>Trailer plate</label>
            <input value={form.trailer_plate} onChange={set('trailer_plate')} />
          </div>
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving...' : request.arrived_at ? 'Save changes' : 'Check driver in'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
