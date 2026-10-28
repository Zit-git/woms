import { useNavigate } from 'react-router-dom';
import { outboundStatusClass } from '../../lib/outboundStatus';

export default function OutboundSidebar({ request, pickTasks, fulfillment }) {
  const navigate = useNavigate();
  const picked = pickTasks.filter((t) => t.status === 'Picked').length;
  const sent = pickTasks.filter((t) => t.cargo_status === 'Dispatched' || t.cargo_status === 'Delivered').length;
  const delivered = pickTasks.filter((t) => t.cargo_status === 'Delivered').length;

  return (
    <div className="wizard-sidebar">
      <div className="card">
        <h3>Status</h3>
        <div style={{ marginBottom: 10 }}>
          <span className={`status-badge ${outboundStatusClass(fulfillment)}`}>{fulfillment}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Pickup Number</span>
          <span>{request.outbound_reference || '—'}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Pickup date</span>
          <span>{request.requested_date || '—'}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Created On</span>
          <span>{request.CREATEDTIME || '—'}</span>
        </div>
      </div>

      <div className="card">
        <h3>Outbound Summary</h3>
        <div className="sidebar-kv">
          <span className="muted small">Handling Units</span>
          <span>{pickTasks.length}</span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Picked</span>
          <span>
            {picked} of {pickTasks.length}
          </span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Sent</span>
          <span>
            {sent} of {pickTasks.length}
          </span>
        </div>
        <div className="sidebar-kv">
          <span className="muted small">Delivered</span>
          <span>
            {delivered} of {pickTasks.length}
          </span>
        </div>
      </div>

      <div className="card">
        <h3>Quick Actions</h3>
        <div className="form-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/pickup/${request.ROWID}`} target="_blank" rel="noreferrer">
            Print Pickup Pass
          </a>
          <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/outbound/${request.ROWID}`} target="_blank" rel="noreferrer">
            Print Goods Issue Note
          </a>
          <button className="btn secondary" onClick={() => navigate('/outbound')}>
            Back to list
          </button>
        </div>
      </div>
    </div>
  );
}
