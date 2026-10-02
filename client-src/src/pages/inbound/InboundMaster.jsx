import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getInboundAdviceById, editInboundAdvice, listCargoByAdvice, listCustomers, listTransporters, listSuppliers } from '../../lib/api';
import InboundDetailView from './InboundDetailView';
import InboundSidebar from './InboundSidebar';
import RequestPopup from './popups/RequestPopup';
import ConfirmPopup from './popups/ConfirmPopup';
import ReceivePopup from './popups/ReceivePopup';
import CheckPopup from './popups/CheckPopup';
import FinishPopup from './popups/FinishPopup';
import { computeInboundSummary } from '../../lib/inboundSummary';
import { useAuth } from '../../context/AuthContext';
import { APPROVER_ROLES } from '../../lib/roles';

const REQUIRED_GENERAL_FIELDS = ['expected_colli', 'destination', 'customer_id', 'expected_date'];

function isRequestIncomplete(advice, cargoRows) {
  const missingGeneral = REQUIRED_GENERAL_FIELDS.some((f) => advice[f] === null || advice[f] === undefined || advice[f] === '');
  const missingCargo =
    cargoRows.length === 0 ||
    cargoRows.some((r) => !r.unit || !r.description || r.weight === null || r.weight === '' || r.weight === undefined || !r.length_cm || !r.width_cm || !r.height_cm);
  return missingGeneral || missingCargo;
}

// The single stable page per inbound record, regardless of status. Each
// stage's data entry happens in a popup scoped to just that stage; this page
// only ever shows the read-only Master view plus one contextual action.
export default function InboundMaster() {
  const { adviceId } = useParams();
  const { businessRole } = useAuth();

  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activePopup, setActivePopup] = useState(null);

  const loadAdvice = useCallback(() => getInboundAdviceById(adviceId).then(setAdvice), [adviceId]);
  const loadCargo = useCallback(() => listCargoByAdvice(adviceId).then(setCargoRows), [adviceId]);
  const reloadSuppliers = useCallback(() => listSuppliers().then(setSuppliers), []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAdvice(), loadCargo(), listCustomers(), listTransporters(), listSuppliers()])
      .then(([, , c, t, s]) => {
        setCustomers(c);
        setTransporters(t);
        setSuppliers(s);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [loadAdvice, loadCargo]);

  const patchAdvice = (fields) => {
    setSaving(true);
    setError('');
    return editInboundAdvice({ ROWID: adviceId, ...fields })
      .then(() => loadAdvice())
      .catch((err) => {
        setError(err.message || String(err));
        throw err;
      })
      .finally(() => setSaving(false));
  };

  const closePopup = () => setActivePopup(null);

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;

  const summary = computeInboundSummary(advice, cargoRows);
  const isApprover = APPROVER_ROLES.includes(businessRole);
  const isAdmin = businessRole === 'System Administrator';

  let action = null;
  if (advice.status === 'Requested' && isApprover) {
    action = isRequestIncomplete(advice, cargoRows)
      ? { label: 'Continue Request →', popup: 'request' }
      : { label: 'Confirm Request →', popup: 'confirm' };
  } else if (advice.status === 'Confirmed' && isApprover) {
    action = { label: 'Mark as Received →', popup: 'receive' };
  } else if (advice.status === 'Received') {
    action = { label: 'Complete Inbound →', popup: 'check' };
  } else if (advice.status === 'Ready') {
    action = { label: 'Finish →', popup: 'finish' };
  } else if (advice.status === 'Completed' && isAdmin) {
    action = { label: 'Edit', popup: 'request' };
  }

  const popupProps = {
    advice,
    cargoRows,
    customers,
    transporters,
    suppliers,
    reloadSuppliers,
    reloadCargo: loadCargo,
    patchAdvice,
    saving,
    setError,
    onClose: closePopup,
  };

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
            editLabel={action?.label || 'View'}
            onEdit={action ? () => setActivePopup(action.popup) : undefined}
          />
        </div>

        <InboundSidebar advice={advice} summary={summary} adviceId={adviceId} saving={saving} />
      </div>

      {activePopup === 'request' && <RequestPopup {...popupProps} />}
      {activePopup === 'confirm' && <ConfirmPopup {...popupProps} />}
      {activePopup === 'receive' && <ReceivePopup {...popupProps} />}
      {activePopup === 'check' && <CheckPopup {...popupProps} />}
      {activePopup === 'finish' && <FinishPopup {...popupProps} />}
    </div>
  );
}
