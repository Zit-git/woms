import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { getInboundAdviceById, editInboundAdvice, listCargoByAdvice, listLinesByAdvice, listHuContentsByAdvice, listCustomers, listTransporters, listSuppliers, listAllStorageLocations, listWarehouses, getGrnForAdvice, listOutboundLinksByAdvice, listOutboundsByInbound } from '../../lib/api';
import InboundDetailView from './InboundDetailView';
import InboundSidebar from './InboundSidebar';
import RequestPopup from './popups/RequestPopup';
import ConfirmPopup from './popups/ConfirmPopup';
import ReceivePopup from './popups/ReceivePopup';
import CreateHUPopup from './popups/CreateHUPopup';
import PutawayPopup from './popups/PutawayPopup';
import CheckPopup from './popups/CheckPopup';
import FinishPopup from './popups/FinishPopup';
import CreateOutboundPopup from './popups/CreateOutboundPopup';
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
  const [createdOutbounds, setCreatedOutbounds] = useState([]); // outbounds opened from this inbound
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
      Promise.all([getGrnForAdvice(adviceId), listOutboundLinksByAdvice(adviceId), listWarehouses(), listOutboundsByInbound(adviceId)]).then(([g, links, w, made]) => {
        setGrn(g);
        setOutboundLinks(links);
        setCreatedOutbounds(made);
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

  // Saves to the same record go through a queue, one at a time and in the order they were made.
  // Fired together (two quick edits, or an edit plus a button that sets the same field) they used
  // to race, and whichever reached the server last won, e.g. an old Expected Colli overwriting the
  // value the user had just set. The re-read of the record runs only after the last queued save.
  const patchQueue = useRef(Promise.resolve());
  const patchesWaiting = useRef(0);
  const patchAdvice = (fields) => {
    setSaving(true);
    setError('');
    patchesWaiting.current += 1;
    const run = () =>
      editInboundAdvice({ ROWID: adviceId, ...fields })
        .then(() => {
          // Show the saved values at once; the re-read (which also refreshes joined names) follows.
          setAdvice((a) => ({ ...a, ...fields }));
        })
        .catch((err) => {
          setError(err.message || String(err));
          throw err;
        })
        .finally(() => {
          patchesWaiting.current -= 1;
          if (patchesWaiting.current === 0) {
            setSaving(false);
            loadAdvice().catch(() => {});
          }
        });
    const result = patchQueue.current.then(run, run);
    patchQueue.current = result.catch(() => {});
    return result;
  };

  // Saves that run on their own in the background (a line item's last field, queued updates to the request)
  // are tracked here, so closing a popup right after typing waits for them before the page is re-read.
  // Otherwise the re-read can overtake the last save and show an inbound that looks incomplete.
  const pendingSaves = useRef(new Set());
  const trackSave = (promise) => {
    pendingSaves.current.add(promise);
    const done = () => pendingSaves.current.delete(promise);
    promise.then(done, done);
    return promise;
  };

  // Popups edit records directly, so refresh everything on the page when one closes.
  const closePopup = () => {
    setActivePopup(null);
    Promise.allSettled([patchQueue.current, ...pendingSaves.current]).then(() => {
      loadAdvice();
      loadLines();
      loadCargo();
      loadExtras();
    });
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

  // Goods exist from the moment Handling Units are created; the customer then asks for them by this inbound or GRN.
  const canCreateOutbound = isApprover && ['HU Created', 'Put Away', 'Ready', 'Completed'].includes(advice.status) && cargoRows.length > 0;

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
    trackSave,
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canCreateOutbound && (
            <button className="btn secondary" onClick={() => setActivePopup('createoutbound')}>
              Create Outbound
            </button>
          )}
          <Link className="link-btn" to="/inbound">
            &larr; Back to Inbound Operations
          </Link>
        </div>
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
            createdOutbounds={createdOutbounds}
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
      {activePopup === 'createoutbound' && <CreateOutboundPopup {...popupProps} grn={grn} />}
    </div>
  );
}
