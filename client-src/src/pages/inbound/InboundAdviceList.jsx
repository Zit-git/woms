import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInboundAdvice, startNewInboundAdvice } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';
import { useAuth } from '../../context/AuthContext';

export default function InboundAdviceList() {
  const navigate = useNavigate();
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const [advices, setAdvices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const { sorted, toggleSort, arrowFor } = useSortableData(advices);

  const load = () => {
    setLoading(true);
    listInboundAdvice(viewer)
      .then(setAdvices)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startNew = () => {
    setCreating(true);
    setError('');
    startNewInboundAdvice(warehouseId)
      .then((created) => navigate(`/inbound/${created.ROWID}`))
      .catch((err) => {
        setError(err.message || String(err));
        setCreating(false);
      });
  };

  return (
    <div>
      <div className="toolbar">
        <h2>Inbound Operations</h2>
        <button className="btn" onClick={startNew} disabled={creating}>
          {creating ? 'Creating...' : '+ New Inbound'}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Reference" sortKey="inbound_reference" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Customer" sortKey="customer_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Destination" sortKey="destination" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Expected date" sortKey="expected_date" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Transporter" sortKey="transporter_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Status" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.ROWID} className="clickable-row" onClick={() => navigate(`/inbound/${a.ROWID}`)}>
                <td>{a.inbound_reference || a.reference_number || <span className="muted">—</span>}</td>
                <td>{a.customer_name}</td>
                <td>{a.destination || <span className="muted">—</span>}</td>
                <td>{a.expected_date}</td>
                <td>{a.transporter_name || <span className="muted">—</span>}</td>
                <td>
                  <span className="status-badge">{a.status}</span>
                </td>
                <td>
                  <span className="link-btn">Open</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No inbounds yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
