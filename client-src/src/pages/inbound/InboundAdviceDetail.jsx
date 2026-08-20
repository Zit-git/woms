import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getInboundAdviceById, listCargoByAdvice, createCargo, generateQRCode, createGRN } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import DocumentUploader from '../../components/DocumentUploader';
import RecordTasks from '../../components/RecordTasks';

export default function InboundAdviceDetail() {
  const { adviceId } = useParams();
  const { user } = useAuth();
  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRow, setBusyRow] = useState(null); // cargo ROWID currently generating QR
  const [grnBusy, setGrnBusy] = useState(false);
  const [grnResult, setGrnResult] = useState(null);
  const [showCargoForm, setShowCargoForm] = useState(false);
  const [cargoForm, setCargoForm] = useState({ description: '', qty: '', unit: '', weight: '', dimensions: '' });
  const [savingCargo, setSavingCargo] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getInboundAdviceById(adviceId), listCargoByAdvice(adviceId)])
      .then(([a, c]) => {
        setAdvice(a);
        setCargoRows(c);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [adviceId]);

  const addCargo = (e) => {
    e.preventDefault();
    setSavingCargo(true);
    createCargo({
      inbound_advice_id: adviceId,
      customer_id: advice.customer_id,
      warehouse_id: advice.warehouse_id,
      description: cargoForm.description,
      qty: cargoForm.qty ? Number(cargoForm.qty) : undefined,
      unit: cargoForm.unit,
      weight: cargoForm.weight ? Number(cargoForm.weight) : undefined,
      dimensions: cargoForm.dimensions,
      status: 'Received',
    })
      .then(() => {
        setShowCargoForm(false);
        setCargoForm({ description: '', qty: '', unit: '', weight: '', dimensions: '' });
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSavingCargo(false));
  };

  const handleGenerateQR = (cargoId) => {
    setBusyRow(cargoId);
    generateQRCode(cargoId)
      .then(() => load())
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  const handleGenerateGRN = () => {
    setGrnBusy(true);
    setGrnResult(null);
    createGRN(adviceId, user?.email_id)
      .then((res) => setGrnResult(res))
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setGrnBusy(false));
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;

  return (
    <div>
      <Link className="link-btn" to="/inbound">
        &larr; Back to Inbound Operations
      </Link>
      <div className="toolbar">
        <h2>
          Advice #{advice.ROWID}
          {advice.reference_number && <span className="muted small"> ({advice.reference_number})</span>}
        </h2>
        <button className="btn" onClick={handleGenerateGRN} disabled={grnBusy || cargoRows.length === 0}>
          {grnBusy ? 'Generating GRN...' : 'Generate GRN'}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {grnResult && (
        <div className="card">
          <strong>GRN generated:</strong> {grnResult.grnNumber}
          <div className="muted small">Document: {grnResult.fileName} (bucket: {grnResult.bucket})</div>
        </div>
      )}

      <div className="card">
        <p>
          <strong>Customer:</strong> {advice.customer_name}
        </p>
        <p>
          <strong>Expected date:</strong> {advice.expected_date}
        </p>
        <p>
          <strong>Transport:</strong> {advice.transport_details}
        </p>
        <p>
          <strong>Status:</strong> <span className="status-badge">{advice.status}</span>
        </p>
      </div>

      <DocumentUploader linkedModule="Inbound Operations" linkedRecordId={adviceId} bucketKey="DOCUMENTS" title="Documents (CMR, packing list, etc.)" />
      <DocumentUploader
        linkedModule="Inbound Operations Photos"
        linkedRecordId={adviceId}
        bucketKey="CARGO_PHOTOS"
        title="Receiving Photos"
      />

      <RecordTasks moduleRef="Inbound Operations" recordRefId={adviceId} />

      <div className="toolbar">
        <h3>Cargo</h3>
        {!showCargoForm && (
          <button className="btn secondary" onClick={() => setShowCargoForm(true)}>
            + Add Cargo
          </button>
        )}
      </div>

      {showCargoForm && (
        <form className="card" onSubmit={addCargo}>
          <div className="form-row">
            <label>Description</label>
            <input value={cargoForm.description} onChange={(e) => setCargoForm({ ...cargoForm, description: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Qty</label>
              <input type="number" value={cargoForm.qty} onChange={(e) => setCargoForm({ ...cargoForm, qty: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Unit</label>
              <input value={cargoForm.unit} onChange={(e) => setCargoForm({ ...cargoForm, unit: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Weight (kg)</label>
              <input type="number" value={cargoForm.weight} onChange={(e) => setCargoForm({ ...cargoForm, weight: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label>Dimensions</label>
            <input value={cargoForm.dimensions} onChange={(e) => setCargoForm({ ...cargoForm, dimensions: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={savingCargo}>
              {savingCargo ? 'Saving...' : 'Save'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowCargoForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Weight</th>
            <th>Status</th>
            <th>QR Code</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cargoRows.map((c) => (
            <tr key={c.ROWID}>
              <td>{c.description}</td>
              <td>
                {c.qty} {c.unit}
              </td>
              <td>{c.weight}</td>
              <td>
                <span className="status-badge">{c.status}</span>
              </td>
              <td>{c.qr_code || <span className="muted">Not generated</span>}</td>
              <td>
                {!c.qr_code && (
                  <button className="link-btn" disabled={busyRow === c.ROWID} onClick={() => handleGenerateQR(c.ROWID)}>
                    {busyRow === c.ROWID ? 'Generating...' : 'Generate QR'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {cargoRows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No cargo added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
