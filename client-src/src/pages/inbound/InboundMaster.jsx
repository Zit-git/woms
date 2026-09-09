import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getInboundAdviceById, listCargoByAdvice, listCustomers, listTransporters, listSuppliers } from '../../lib/api';
import InboundDetailView from './InboundDetailView';
import InboundSidebar from './InboundSidebar';
import { computeInboundSummary } from '../../lib/inboundSummary';

// The inbound record itself -- one stable page, regardless of status. This
// is deliberately a separate component/route from InboundWizard: opening a
// record to look at it and running the step-by-step intake workflow are two
// different things, not one component switching faces internally.
export default function InboundMaster() {
  const { adviceId } = useParams();
  const navigate = useNavigate();

  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getInboundAdviceById(adviceId),
      listCargoByAdvice(adviceId),
      listCustomers(),
      listTransporters(),
      listSuppliers(),
    ])
      .then(([a, c, cu, t, s]) => {
        setAdvice(a);
        setCargoRows(c);
        setCustomers(cu);
        setTransporters(t);
        setSuppliers(s);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [adviceId]);

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;

  const summary = computeInboundSummary(advice, cargoRows);
  const isPending = advice.status === 'Pending';

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>{advice.inbound_reference || `Inbound #${advice.ROWID}`}</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            Inbound record
          </p>
        </div>
        <Link className="link-btn" to="/inbound">
          &larr; Back to Inbound Operations
        </Link>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="wizard-layout">
        <div className="wizard-main">
          <InboundDetailView
            advice={advice}
            cargoRows={cargoRows}
            customers={customers}
            transporters={transporters}
            suppliers={suppliers}
            editLabel={isPending ? 'Continue Inbound →' : 'Edit'}
            onEdit={() => navigate(`/inbound/${adviceId}/wizard`)}
          />
        </div>

        <InboundSidebar advice={advice} summary={summary} adviceId={adviceId} saving={false} />
      </div>
    </div>
  );
}
