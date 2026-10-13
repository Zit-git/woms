import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { getInboundAdviceById, editInboundAdvice, listCargoByAdvice, listLinesByAdvice, listHuContentsByAdvice, listCustomers, listTransporters, listSuppliers, listAllStorageLocations, listWarehouses, getGrnForAdvice, listOutboundLinksByAdvice } from '../../lib/api';
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
import { validateRequestDates, colliMismatch } from '../../lib/inboundValidation';
import { useAuth } from '../../context/AuthContext';

const REQUIRED_GENERAL_FIELDS = ['expected_colli', 'destination', 'customer_id', 'expected_date'];

function isRequestIncomplete(advice, lines) {
  const missingGeneral = REQUIRED_GENERAL_FIELDS.some((f) => advice[f] === null || advice[f] === undefined || advice[f] === '');
  const missingLines =
    lines.length === 0 ||
    lines.some((r) => !r.unit || !r.description || !Number(r.qty) || r.weight === null || r.weight === '' || r.weight === undefined || !r.length_cm || !r.width_cm || !r.height_cm);
  // A request is only ready for the availability check when its dates make
  // sense and Expected Colli equals the packages actually listed.
  const brokenRules = Object.keys(validateRequestDates(advice, { allowPast: advice.status !== 'Requested' })).length > 0 || Boolean(colliMismatch(advice.expected_colli, lines));
  return missingGeneral || missingLines || brokenRules;
}

// The single stable page per inbound record, regardless of status. Each
// stage's data entry happens in a popup scoped to just that stage; this page
// only ever shows the read-only Master view plus one contextual action.
export default function InboundMaster() {
  const { adviceId } = useParams();
  const { isAdmin, canApproveIn, canAccessWarehouse } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [advice, setAdvice] = useState(null);
  const [lines, setLines] = useState([]); // the plan
  const [cargoRows, setCargoRows] = useState([]); // Handling Units
  const [huContents, setHuContents] = useState([]); // which lines sit in which HU
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [grn, setGrn] = useState(null);
  const [outboundLinks, setOutboundLinks] = useState([]); // which outbound each HU left on
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
  const loadExtras = useCallback(
    () =>
      Promise.all([getGrnForAdvice(adviceId), listOutboundLinksByAdvice(adviceId), listWarehouses()]).then(([g, links, w]) => {
        setGrn(g);
        setOutboundLinks(links);
        setWarehouses(w);
      }),
    [adviceId]
  );
  const reloadSuppliers = useCallback(() => listSuppliers().then(setSuppliers), []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAdvice(), loadLines(), loadCargo(), loadExtras(), listCustomers(), listTransporters(), listSuppliers(), listAllStorageLocations()])
      .then(([, , , , c, t, s, l]) => {
        setLocationLabels(new Map(l.map((x) => [String(x.ROWID), x.location_code])));
        setCustomers(c);
        setTransporters(t);
        setSuppliers(s);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [loadAdvice, loadLines, loadCargo, loadExtras]);

  // A freshly created inbound (from "+ New Inbound") goes straight into the
  // Request popup instead of showing an empty page first. The flag is cleared
  // so a refresh or later visit doesn't reopen it.
  useEffect(() => {
    if (loading || !advice || !location.state?.openRequest) return;
    navigate(location.pathname, { replace: true, state: null });
    if (advice.status === 'Requested' && canApproveIn(advice.warehouse_id)) setActivePopup('request');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, advice, location, navigate]);

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

  // Popups edit records directly, so refresh everything on the page when one closes.
  const closePopup = () => {
    setActivePopup(null);
    loadAdvice();
    loadLines();
    loadCargo();
    loadExtras();
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;
  if (!canAccessWarehouse(advice.warehouse_id)) {
    return <p className="error-text">You don't have access to this warehouse's records.</p>;
  }

  const summary = computeInboundSummary(advice, lines, cargoRows);
  // Role is per warehouse: what this user may do here depends on this inbound's warehouse.
  const isApprover = canApproveIn(advice.warehouse_id);

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
            warehouses={warehouses}
            grn={grn}
            outboundLinks={outboundLinks}
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
