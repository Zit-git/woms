import { useNavigate } from 'react-router-dom';

const STATUS_CLASS = {
  Requested: 'status-requested',
  Confirmed: 'status-confirmed',
  Rejected: 'status-rejected',
  Received: 'status-received',
  'HU Created': 'status-confirmed',
  Ready: 'status-ready',
  Completed: 'status-completed',
};

// Shared across the Inbound stage popups and the Master page for the same
// record -- identical regardless of which stage is active.
export default function InboundSidebar({ advice, summary, adviceId, saving }) {
  const navigate = useNavigate();

  return (
    <div className="wizard-sidebar">
      <div className="card">
        <h3>Status</h3>
        <div style={{ marginBottom: 10 }}>
          <span className={`status-badge ${STATUS_CLASS[advice.status] || ''}`}>{advice.status || 'Requested'}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Inbound Number</span>
          <span>{advice.inbound_reference || '—'}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Status</span>
          <span>{advice.status}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Created On</span>
          <span>{advice.CREATEDTIME || '—'}</span>
        </div>
      </div>

      <div className="card">
        <h3>Inbound Summary</h3>
        <div className="sidebar-kv">
          <span className="muted small">Expected Colli</span>
          <span>{summary.expectedColli}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Received Pieces (Inner)</span>
          <span>{summary.receivedPieces}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Total Outer Packages</span>
          <span>{summary.totalOuterPackages}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Total Weight</span>
          <span>{summary.totalWeight.toFixed(2)} kg</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Total Volume</span>
          <span>{summary.totalVolume.toFixed(3)} m³</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Pallets</span>
          <span>{summary.pallets}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Items</span>
          <span>{summary.items}</span>
        </div>
      </div>

      <div className="card">
        <h3>Quick Actions</h3>
        <div className="form-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {(advice.status === 'HU Created' || advice.status === 'Ready' || advice.status === 'Completed') && (
            <a
              className="btn secondary"
              href={`${import.meta.env.BASE_URL}print/putaway/${adviceId}`}
              target="_blank"
              rel="noreferrer"
            >
              Reprint Labels
            </a>
          )}
          <button
            className="btn secondary"
            disabled={saving}
            onClick={() => navigate('/inbound')}
            title="Fields save automatically as you go"
          >
            Save as Draft
          </button>
          <button className="btn secondary" onClick={() => navigate('/inbound')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
