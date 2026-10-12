import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { getInboundAdviceById, editInboundAdvice, listCargoByAdvice, listLinesByAdvice, listHuContentsByAdvice, listCustomers, listTransporters, listSuppliers, listAllStorageLocations } from '../../lib/api';
import InboundDetailView from './InboundDetailView';
import InboundSidebar from './InboundSidebar';
import RequestPopup from './popups/RequestPopup';
import ConfirmPopup from './popups/ConfirmPopup';
import ReceivePopup from './popups/ReceivePopup';
import CreateHUPopup from './popups/CreateHUPopup';
import PutawayPopup from './popups/PutawayPopup';
import CheckPopup from './popups/CheckPopup';
import FinishPopup from './popups/FinishPopup';
import { computeInboundSummary } from '../../lib/inboundSummary';
import { useAuth } from '../../context/AuthContext';
import { APPROVER_ROLES } from '../../lib/roles';

const REQUIRED_GENERAL_FIELDS = ['expected_colli', 'destination', 'customer_id', 'expected_date'];

function isRequestIncomplete(advice, lines) {
  const missingGeneral = REQUIRED_GENERAL_FIELDS.some((f) => advice[f] === null || advice[f] === undefined || advice[f] === '');
  const missingLines =
    lines.length === 0 ||
    lines.some((r) => !r.unit || !r.description || !Number(r.qty) || r.weight === null || r.weight === '' || r.weight === undefined || !r.length_cm || !r.width_cm || !r.height_cm);
  return missingGeneral || missingLines;
}

// The single stable page per inbound record, regardless of status. Each
// stage's data entry happens in a popup scoped to just that stage; this page
// only ever shows the read-only Master view plus one contextual action.
export default function InboundMaster() {
  const { adviceId } = useParams();
  const { businessRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [advice, setAdvice] = useState(null);
  const [lines, setLines] = useState([]); // the plan
  const [cargoRows, setCargoRows] = useState([]); // Handling Units
  const [huContents, setHuContents] = useState([]); // which lines sit in which HU
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [locationLabels, setLocationLabels] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activePopup, setActivePopup] = useState(null);

  const loadAdvice = useCallback(() => getInboundAdviceById(adviceId).then(setAdvice), [adviceId]);
  const loadLines = useCallback(() => listLinesByAdvice(adviceId).then(setLines), [adviceId]);
  const loadCargo = useCallback(
    () => Promise.all([listCargoByAdvice(adviceId), listHuContentsByAdvice(adviceId)]).then(([hus, contents]) => {
      setCargoRows(hus);
      setHuContents(contents);
    }),
    [adviceId]
  );
  const reloadSuppliers = useCallback(() => listSuppliers().then(setSuppliers), []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAdvice(), loadLines(), loadCargo(), listCustomers(), listTransporters(), listSuppliers(), listAllStorageLocations()])
      .then(([, , , c, t, s, l]) => {
        setLocationLabels(new Map(l.map((x) => [String(x.ROWID), x.location_code])));
        setCustomers(c);
        setTransporters(t);
        setSuppliers(s);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [loadAdvice, loadLines, loadCargo]);

  // A freshly created inbound (from "+ New Inbound") goes straight into the
  // Request popup instead of showing an empty page first. The flag is cleared
  // so a refresh or later visit doesn't reopen it.
  useEffect(() => {
    if (loading || !advice || !location.state?.openRequest) return;
    navigate(location.pathname, { replace: true, state: null });
    if (advice.status === 'Requested' && APPROVER_ROLES.includes(businessRole)) setActivePopup('request');
  }, [loading, advice, location, navigate, businessRole]);

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

  const summary = computeInboundSummary(advice, lines, cargoRows);
  const isApprover = APPROVER_ROLES.includes(businessRole);
  const isAdmin = businessRole === 'System Administrator';

  let action = null;
  if (advice.status === 'Requested' && isApprover) {
    action = isRequestIncomplete(advice, lines)
      ? { label: 'Continue Request →', popup: 'request' }
      : { label: 'Availability Check →', popup: 'confirm' };
  } else if (advice.status === 'Confirmed' && isApprover) {
    action = { label: 'Mark as Received →', popup: 'receive' };
  } else if (advice.status === 'Received') {
    action = { label: 'Create Handling Units →', popup: 'createhu' };
  } else if (advice.status === 'HU Created') {
    action = { label: 'Put Away →', popup: 'putaway' };
  } else if (advice.status === 'Put Away') {
    action = { label: 'Complete Inbound →', popup: 'check' };
  } else if (advice.status === 'Ready') {
    action = { label: 'Finish →', popup: 'finish' };
  } else if (advice.status === 'Completed' && isAdmin) {
    action = { label: 'Edit', popup: 'request' };
  } else if (advice.status === 'Rejected' && isAdmin) {
    action = { label: 'Reopen Request', popup: 'request', resetStatus: 'Requested' };
  }

  const openAction = () => {
    if (!action) return;
    if (action.resetStatus) {
      patchAdvice({ status: action.resetStatus }).then(() => setActivePopup(action.popup));
    } else {
      setActivePopup(action.popup);
    }
  };

  // Request details and line items stay editable until the goods are received.
  // An accepted (Confirmed) inbound was availability-checked against the old
  // plan, so editing it sends it back to Requested for a fresh check.
  const canEditRequest = isApprover && (advice.status === 'Requested' || advice.status === 'Confirmed') && action?.popup !== 'request';
  const editRequest = () => {
    if (advice.status === 'Confirmed') {
      if (!window.confirm('This inbound is already accepted. Editing it sends it back to "Requested" so the availability check is run again. Continue?')) return;
      patchAdvice({ status: 'Requested' })
        .then(() => setActivePopup('request'))
        .catch(() => {});
    } else {
      setActivePopup('request');
    }
  };

  const popupProps = {
    advice,
    lines,
    cargoRows,
    huContents,
    customers,
    transporters,
    suppliers,
    reloadSuppliers,
    reloadLines: loadLines,
    reloadCargo: loadCargo,
    reloadHus: loadCargo,
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
            lines={lines}
            cargoRows={cargoRows}
            huContents={huContents}
            customers={customers}
            transporters={transporters}
            suppliers={suppliers}
            locationLabels={locationLabels}
            editLabel={action?.label || 'View'}
            onEdit={action ? openAction : undefined}
            onEditRequest={canEditRequest ? editRequest : undefined}
          />
        </div>

        <InboundSidebar advice={advice} summary={summary} adviceId={adviceId} saving={saving} />
      </div>

      {activePopup === 'request' && <RequestPopup {...popupProps} />}
      {activePopup === 'confirm' && <ConfirmPopup {...popupProps} />}
      {activePopup === 'receive' && <ReceivePopup {...popupProps} />}
      {activePopup === 'createhu' && <CreateHUPopup {...popupProps} />}
      {activePopup === 'putaway' && <PutawayPopup {...popupProps} />}
      {activePopup === 'check' && <CheckPopup {...popupProps} />}
      {activePopup === 'finish' && <FinishPopup {...popupProps} />}
    </div>
  );
}
