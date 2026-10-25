import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { createHandlingUnit, deleteHandlingUnit, listPackageTypes } from '../../../lib/api';
import { decimal2 } from '../../../lib/format';

const DEFAULT_HU_TYPES = ['Pallet', 'Box', 'Crate', 'Carton', 'Bag', 'Drum', 'Roll', 'Other'];

const huLabel = (advice, c) =>
  advice.inbound_reference ? `${advice.inbound_reference}-${String(c.outer_package_no || '').padStart(3, '0')}` : c.outer_package_no;

// Stage: Create Handling Units. Line items are the plan; a Handling Unit is
// the physical unit actually built at receiving, and it can hold any mix of
// lines (two lines on one pallet) or only part of a line (a line spread over
// several pallets). Every received package must end up on an HU before the
// inbound moves on to put-away. Each HU gets its own QR label on creation.
export default function CreateHUPopup({ advice, lines, cargoRows, huContents, reloadHus, patchAdvice, onClose }) {
  const [huTypes, setHuTypes] = useState(DEFAULT_HU_TYPES);
  const [type, setType] = useState('Pallet');
  const [qtys, setQtys] = useState({}); // lineId -> qty string for the HU being built
  const [weight, setWeight] = useState('');
  const [dims, setDims] = useState({ length_cm: '', width_cm: '', height_cm: '' });
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listPackageTypes()
      .then((types) => {
        const names = types.map((t) => t.name).filter(Boolean);
        if (names.length) setHuTypes(names);
      })
      .catch(() => {});
  }, []);

  const linesById = useMemo(() => new Map(lines.map((l) => [String(l.ROWID), l])), [lines]);
  const packedByLine = useMemo(() => {
    const m = new Map();
    huContents.forEach((h) => m.set(String(h.inbound_line_id), (m.get(String(h.inbound_line_id)) || 0) + h.qty));
    return m;
  }, [huContents]);
  const remainingOf = (l) => Math.max((Number(l.received_qty) || 0) - (packedByLine.get(String(l.ROWID)) || 0), 0);

  const draftContents = lines
    .map((l) => ({ line: l, qty: Number(qtys[l.ROWID]) || 0 }))
    .filter((c) => c.qty > 0);
  const totalRemaining = lines.reduce((sum, l) => sum + remainingOf(l), 0);

  const contentsByHu = useMemo(() => {
    const m = new Map();
    huContents.forEach((h) => {
      const key = String(h.cargo_id);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(h);
    });
    return m;
  }, [huContents]);

  const nextHuNo = () => cargoRows.reduce((max, c) => Math.max(max, parseInt(c.outer_package_no, 10) || 0), 0) + 1;

  // Sensible defaults for the HU being built, so the common case needs no typing.
  const suggestFrom = (nextQtys) => {
    const picked = lines.map((l) => ({ l, q: Number(nextQtys[l.ROWID]) || 0 })).filter((x) => x.q > 0);
    if (!picked.length) return;
    setWeight(String(Math.round(picked.reduce((sum, x) => sum + (Number(x.l.weight) || 0) * x.q, 0) * 100) / 100 || ''));
    const first = picked[0].l;
    setDims((d) => ({
      length_cm: d.length_cm || first.length_cm || '',
      width_cm: d.width_cm || first.width_cm || '',
      height_cm: d.height_cm || first.height_cm || '',
    }));
  };
  const setQty = (lineId, value) => {
    const next = { ...qtys, [lineId]: value };
    setQtys(next);
    suggestFrom(next);
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reloadHus();
    } catch (err) {
      setError(err.message || String(err));
      await reloadHus().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const addHu = () => {
    const n = Math.max(parseInt(copies, 10) || 1, 1);
    for (const c of draftContents) {
      if (c.qty * n > remainingOf(c.line)) {
        setError(`Line ${c.line.line_no}: only ${remainingOf(c.line)} package(s) left to pack, but ${c.qty * n} requested.`);
        return;
      }
    }
    if (!draftContents.length) {
      setError('Enter a quantity for at least one line.');
      return;
    }
    run(async () => {
      let huNo = nextHuNo();
      for (let i = 0; i < n; i++) {
        await createHandlingUnit({ advice, huNo: huNo++, unit: type, weight, ...dims, contents: draftContents });
      }
      setQtys({});
      setWeight('');
      setDims({ length_cm: '', width_cm: '', height_cm: '' });
      setCopies(1);
    });
  };

  // The simple case: every package becomes its own HU of the line's own
  // type, with that line's weight and size.
  const onePerPackage = () =>
    run(async () => {
      let huNo = nextHuNo();
      for (const l of lines) {
        for (let i = 0; i < remainingOf(l); i++) {
          await createHandlingUnit({
            advice,
            huNo: huNo++,
            unit: l.unit || 'Box',
            weight: l.weight ?? '',
            length_cm: l.length_cm ?? '',
            width_cm: l.width_cm ?? '',
            height_cm: l.height_cm ?? '',
            contents: [{ line: l, qty: 1 }],
          });
        }
      }
    });

  const removeHu = (c) => run(() => deleteHandlingUnit(c.ROWID));

  const finish = () => {
    setBusy(true);
    setError('');
    patchAdvice({ status: 'HU Created' })
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`Create Handling Units: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      {error && <div className="error-text">{error}</div>}

      <p className="muted small">
        Pack what was received onto Handling Units. One HU can hold several line items, and one line item can be spread over several HUs.
        Each HU gets its own QR label.
      </p>

      <div className="form-section-title" style={{ marginTop: 0 }}>Line items</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="stack-on-phone">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Received</th>
              <th>On HUs</th>
              <th>Left to pack</th>
              <th>Put on new HU</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const left = remainingOf(l);
              return (
                <tr key={l.ROWID}>
                  <td data-label="Line">{l.line_no}</td>
                  <td data-label="Description">{l.description || '—'}</td>
                  <td data-label="Unit">{l.unit}</td>
                  <td data-label="Received">{Number(l.received_qty) || 0}</td>
                  <td data-label="On HUs">{packedByLine.get(String(l.ROWID)) || 0}</td>
                  <td data-label="Left to pack" style={left > 0 ? { fontWeight: 600 } : undefined}>{left}</td>
                  <td data-label="Put on new HU">
                    <input
                      type="number"
                      min="0"
                      max={left}
                      style={{ width: 80 }}
                      disabled={busy || left === 0}
                      value={qtys[l.ROWID] ?? ''}
                      onChange={(e) => setQty(l.ROWID, e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">No line items on this inbound.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalRemaining > 0 && (
        <>
          <div className="form-section-title">New Handling Unit</div>
          <div className="form-grid-3">
            <div className="form-row">
              <label>HU type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
                {huTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Weight (kg)</label>
              <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={busy} />
            </div>
            <div className="form-row">
              <label>Create this many identical HUs</label>
              <input type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="form-grid-3">
            {[['length_cm', 'Length (cm)'], ['width_cm', 'Width (cm)'], ['height_cm', 'Height (cm)']].map(([k, label]) => (
              <div className="form-row" key={k}>
                <label>{label}</label>
                <input type="number" value={dims[k]} onChange={(e) => setDims((d) => ({ ...d, [k]: e.target.value }))} disabled={busy} />
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button className="btn secondary" onClick={onePerPackage} disabled={busy}>
              One HU per package (all lines)
            </button>
            <button className="btn" onClick={addHu} disabled={busy || draftContents.length === 0}>
              {busy ? 'Creating...' : 'Add Handling Unit'}
            </button>
          </div>
          <p className="muted small">
            Type quantities in "Put on new HU" for the lines this HU holds, then add it. Several lines on one HU = combine; the same line on several HUs = split.
          </p>
        </>
      )}

      <div className="form-section-title">Handling Units ({cargoRows.length})</div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>HU</th>
              <th>Type</th>
              <th>Contents</th>
              <th>Weight (kg)</th>
              <th>L×W×H (cm)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargoRows.map((c) => (
              <tr key={c.ROWID}>
                <td><strong>{huLabel(advice, c)}</strong></td>
                <td>{c.unit}</td>
                <td>
                  {(contentsByHu.get(String(c.ROWID)) || [])
                    .map((h) => {
                      const l = linesById.get(String(h.inbound_line_id));
                      return `#${l?.line_no ?? '?'} ${l?.description || l?.unit || ''} × ${h.qty}`;
                    })
                    .join(' · ') || c.description || '—'}
                </td>
                <td>{decimal2(c.weight)}</td>
                <td>{c.length_cm ?? '—'}×{c.width_cm ?? '—'}×{c.height_cm ?? '—'}</td>
                <td>
                  {!c.current_location_id && (
                    <button className="link-btn" onClick={() => removeHu(c)} disabled={busy}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {cargoRows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No Handling Units yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        {cargoRows.length > 0 && (
          <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}`} target="_blank" rel="noreferrer">
            Print Labels
          </a>
        )}
        <button className="btn" onClick={finish} disabled={busy || totalRemaining > 0 || cargoRows.length === 0}>
          {totalRemaining > 0 ? `${totalRemaining} package${totalRemaining === 1 ? '' : 's'} still to pack` : 'Continue to Put-away →'}
        </button>
      </div>
    </Modal>
  );
}
