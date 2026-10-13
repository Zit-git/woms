import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getOutboundRequestById,
  listPickTasksByRequest,
  listAvailableCargoForCustomer,
  listDispatchesByRequest,
  listAllStorageLocations,
} from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import OutboundDetailView from './OutboundDetailView';
import OutboundSidebar from './OutboundSidebar';
import GoodsPopup from './popups/GoodsPopup';
import PickPopup from './popups/PickPopup';
import CheckInPopup from './popups/CheckInPopup';
import DispatchPopup from './popups/DispatchPopup';
import DeliverPopup from './popups/DeliverPopup';
import { computeOutboundFulfillment, outboundActions } from '../../lib/outboundStatus';

// The single stable page per outbound record. Each stage's work happens in a
// popup scoped to just that stage; this page only ever shows the read-only
// record plus the actions that are available -- the mirror of InboundMaster.
export default function OutboundMaster() {
  const { requestId } = useParams();
  const { canAccessWarehouse } = useAuth();
  const [request, setRequest] = useState(null);
  const [pickTasks, setPickTasks] = useState([]);
  const [availableCargo, setAvailableCargo] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [locations, setLocations] = useState(() => new Map()); // location id -> { code, path }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activePopup, setActivePopup] = useState(null);

  // Refreshes in place (no loading flash) so an open popup keeps its state.
  const reload = useCallback(
    () =>
      getOutboundRequestById(requestId)
        .then((r) => {
          setRequest(r);
          return Promise.all([
            listPickTasksByRequest(requestId),
            r ? listAvailableCargoForCustomer(r.customer_id) : [],
            listDispatchesByRequest(requestId),
          ]);
        })
        .then(([tasks, cargo, disp]) => {
          setPickTasks(tasks);
          const pickedCargoIds = new Set(tasks.map((t) => String(t.cargo_id)));
          setAvailableCargo(cargo.filter((c) => !pickedCargoIds.has(String(c.ROWID))));
          setDispatches(disp);
        }),
    [requestId]
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([
      reload(),
      listAllStorageLocations().then((list) =>
        setLocations(new Map(list.map((l) => [String(l.ROWID), { code: l.location_code, path: l.path }])))
      ),
    ])
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [reload]);

  const closePopup = () => {
    setActivePopup(null);
    reload().catch((err) => setError(err.message || String(err)));
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!request) return <p className="error-text">Outbound request not found.</p>;
  if (!canAccessWarehouse(request.warehouse_id)) {
    return <p className="error-text">You don't have access to this warehouse's records.</p>;
  }

  const dispatched = dispatches.length > 0;
  const fulfillment = computeOutboundFulfillment(pickTasks);
  const { primary, others } = outboundActions(request, pickTasks, dispatched);

  const popupProps = {
    request,
    pickTasks,
    availableCargo,
    dispatches,
    locations,
    reload,
    setError,
    onClose: closePopup,
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>{request.outbound_reference || `Outbound Request #${request.ROWID}`}</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            Outbound record
          </p>
        </div>
        <Link className="link-btn" to="/outbound">
          &larr; Back to Outbound Operations
        </Link>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="wizard-layout">
        <div className="wizard-main">
          <OutboundDetailView
            request={request}
            pickTasks={pickTasks}
            dispatches={dispatches}
            locations={locations}
            primary={primary}
            others={others}
            onAction={setActivePopup}
          />
        </div>
        <OutboundSidebar request={request} pickTasks={pickTasks} fulfillment={fulfillment} />
      </div>

      {activePopup === 'goods' && <GoodsPopup {...popupProps} />}
      {activePopup === 'pick' && <PickPopup {...popupProps} />}
      {activePopup === 'checkin' && <CheckInPopup {...popupProps} />}
      {activePopup === 'dispatch' && <DispatchPopup {...popupProps} />}
      {activePopup === 'deliver' && <DeliverPopup {...popupProps} />}
    </div>
  );
}
