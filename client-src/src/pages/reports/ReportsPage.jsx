import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCargoRegister, listDispatchReport } from '../../lib/api';

const TABS = [
  { key: 'cargo', label: 'Cargo Register' },
  { key: 'dispatch', label: 'Dispatch Report' },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('cargo');
  const [cargo, setCargo] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([listCargoRegister(), listDispatchReport()])
      .then(([c, d]) => {
        setCargo(c);
        setDispatches(d);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2>Reports & Dashboards</h2>
      <p className="muted small">Live KPIs are on the Dashboard home page; this page covers detailed tabular reports.</p>

      {error && <div className="error-text">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : tab === 'cargo' ? (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Location</th>
              <th>QR Code</th>
            </tr>
          </thead>
          <tbody>
            {cargo.map((c) => (
              <tr key={c.ROWID} className="clickable-row" onClick={() => navigate(`/cargo/${c.ROWID}`)}>
                <td>{c.customer_name}</td>
                <td>{c.description}</td>
                <td>
                  {c.qty} {c.unit}
                </td>
                <td>
                  <span className="status-badge">{c.status}</span>
                </td>
                <td>{c.location_code || <span className="muted">Unassigned</span>}</td>
                <td>{c.qr_code || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {cargo.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No cargo records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Outbound Request</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Dispatched by</th>
              <th>Dispatch date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.ROWID}>
                <td>#{d.outbound_request_id}</td>
                <td>{d.customer_name}</td>
                <td>{d.vehicle_details}</td>
                <td>{d.dispatched_by}</td>
                <td>{d.dispatch_date}</td>
                <td>
                  <span className="status-badge">{d.status}</span>
                </td>
              </tr>
            ))}
            {dispatches.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No dispatches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
