import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCargoTimeline } from '../../lib/api';

export default function CargoDetail() {
  const { cargoId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getCargoTimeline(cargoId)
      .then(setData)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [cargoId]);

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <div className="error-text">{error}</div>;
  if (!data?.cargo) return <p className="error-text">Cargo not found.</p>;

  const { cargo, movements, scans } = data;

  // Merge movement + scan events into one chronological timeline.
  const events = [
    ...movements.map((m) => ({
      timestamp: m.movement_timestamp,
      label: `${m.movement_type} — by ${m.moved_by || 'unknown'}${m.to_location_id ? ` → location #${m.to_location_id}` : ''}`,
    })),
    ...scans.map((s) => ({
      timestamp: s.scan_timestamp,
      label: `Scanned (${s.scan_context}) — by ${s.scanned_by || 'unknown'}`,
    })),
  ].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return (
    <div>
      <Link className="link-btn" to="/reports">
        &larr; Back to Reports
      </Link>
      <div className="toolbar">
        <h2>Cargo #{cargo.ROWID}</h2>
      </div>

      <div className="card">
        <p>
          <strong>Description:</strong> {cargo.description}
        </p>
        <p>
          <strong>Qty:</strong> {cargo.qty} {cargo.unit}
        </p>
        <p>
          <strong>QR Code:</strong> {cargo.qr_code || <span className="muted">Not generated</span>}
        </p>
        <p>
          <strong>Status:</strong> <span className="status-badge">{cargo.status}</span>
        </p>
      </div>

      <h3>Lifecycle Timeline</h3>
      {events.length === 0 ? (
        <p className="muted small">No movement or scan history recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td>{e.timestamp}</td>
                <td>{e.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
