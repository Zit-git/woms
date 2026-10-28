import { lazy, Suspense, useRef, useState } from 'react';
import Modal from '../../../components/Modal';
import { editPickTask, recordScan } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { pickLineForCode } from '../../../lib/scanning';

const QrScannerModal = lazy(() => import('../../../components/QrScannerModal'));

// Stage: fetch each Handling Unit and scan its QR, in walking order.
export default function PickPopup({ request, pickTasks, locations, reload, setError, onClose }) {
  const { user } = useAuth();
  const [busyRow, setBusyRow] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // What still has to be picked first, walking the warehouse by location code; picked lines last.
  const ordered = [...pickTasks].sort((a, b) => {
    if ((a.status === 'Picked') !== (b.status === 'Picked')) return a.status === 'Picked' ? 1 : -1;
    const codeA = locations.get(String(a.cargo_location_id))?.code || '￿';
    const codeB = locations.get(String(b.cargo_location_id))?.code || '￿';
    return codeA.localeCompare(codeB, undefined, { numeric: true });
  });
  const pickedCount = pickTasks.filter((t) => t.status === 'Picked').length;

  // The camera stays open between scans, so the handler must see the pick list as it is now, not as it was
  // when the camera was opened.
  const tasksRef = useRef(pickTasks);
  tasksRef.current = pickTasks;

  const doPick = (task) =>
    recordScan(task.cargo_id, user?.email_id || '', 'pick')
      .then(() => editPickTask({ ROWID: task.ROWID, status: 'Picked' }))
      .then(reload);

  // Manual: the Mark picked button on a line.
  const pick = (task) => {
    setBusyRow(task.ROWID);
    return doPick(task)
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  // Scanned or typed: one answer per code, the camera stays on until everything is picked.
  const onScanned = async (code) => {
    const { task, state } = pickLineForCode(tasksRef.current, code);
    if (state === 'none') return { ok: false, message: `"${code}" is not on this pick list.` };
    if (state === 'picked') return { ok: false, message: `${task.cargo_hu_no ? `HU ${task.cargo_hu_no}` : 'That unit'} is already picked.` };
    try {
      await doPick(task);
    } catch (err) {
      return { ok: false, message: err.error || err.message || String(err) };
    }
    const left = tasksRef.current.filter((t) => t.status !== 'Picked' && t.ROWID !== task.ROWID).length;
    return {
      ok: true,
      message: `Picked ${task.cargo_hu_no ? `HU ${task.cargo_hu_no}` : task.cargo_description || 'unit'}. ${left ? `${left} still to pick.` : 'All picked.'}`,
      done: left === 0,
    };
  };

  return (
    <Modal title={`Pick goods: ${request.outbound_reference || `#${request.ROWID}`}`} onClose={onClose} wide>
      <div className="toolbar">
        <span className="muted small">
          {pickedCount} of {pickTasks.length} picked · scan each label (the camera stays on), or tap Mark picked on a line
        </span>
        {pickTasks.some((t) => t.status !== 'Picked') && (
          <button className="btn secondary" onClick={() => setShowScanner(true)}>
            Scan to Pick
          </button>
        )}
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <QrScannerModal continuous title="Scan to pick" onDecode={onScanned} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      <table className="stack-on-phone">
        <thead>
          <tr>
            <th>Fetch from</th>
            <th>Cargo</th>
            <th>Qty</th>
            <th>QR Code</th>
            <th>Pick Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((t) => {
            const loc = locations.get(String(t.cargo_location_id));
            return (
              <tr key={t.ROWID}>
                <td data-label="Fetch from">
                  {t.status === 'Picked' ? (
                    <span className="muted small">Picked</span>
                  ) : loc ? (
                    <>
                      <strong>{loc.code}</strong>
                      <div className="muted small">{loc.path}</div>
                    </>
                  ) : (
                    <span className="muted small">Not in a rack: at the dock</span>
                  )}
                </td>
                <td data-label="Cargo">
                  {t.cargo_hu_no ? <strong>HU {t.cargo_hu_no}</strong> : null} {t.cargo_description}
                </td>
                <td data-label="Qty">
                  {t.cargo_qty} {t.cargo_unit}
                </td>
                <td data-label="QR">{t.cargo_qr_code || <span className="muted">Not generated</span>}</td>
                <td data-label="Status">
                  <span className="status-badge">{t.status}</span>
                </td>
                <td>
                  {t.status !== 'Picked' && (
                    <button className="link-btn" disabled={busyRow === t.ROWID} onClick={() => pick(t)}>
                      {busyRow === t.ROWID ? 'Saving...' : 'Mark picked'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No goods selected yet. Use "Edit Goods" first.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
