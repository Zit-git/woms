import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getInboundAdviceById,
  editInboundAdvice,
  listCargoByAdvice,
  listCustomers,
  listTransporters,
} from '../../lib/api';
import Stepper from '../../components/Stepper';
import StepGeneral from './steps/StepGeneral';
import StepGoods from './steps/StepGoods';
import StepDocuments from './steps/StepDocuments';
import StepCheck from './steps/StepCheck';
import StepFinish from './steps/StepFinish';
import { computeInboundSummary } from '../../lib/inboundSummary';

const STEPS = [
  { key: 'general', label: 'General', sublabel: 'Arrival details' },
  { key: 'goods', label: 'Line Items', sublabel: 'Add cargo lines' },
  { key: 'documents', label: 'Documents', sublabel: 'Upload files' },
  { key: 'check', label: 'Check', sublabel: 'Verify information' },
  { key: 'finish', label: 'Finish', sublabel: 'Complete inbound' },
];

export default function InboundWizard() {
  const { adviceId } = useParams();
  const navigate = useNavigate();

  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stepKey, setStepKey] = useState('general');
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadAdvice = useCallback(
    () => getInboundAdviceById(adviceId).then(setAdvice),
    [adviceId]
  );
  const loadCargo = useCallback(() => listCargoByAdvice(adviceId).then(setCargoRows), [adviceId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAdvice(), loadCargo(), listCustomers(), listTransporters()])
      .then(([, , c, t]) => {
        setCustomers(c);
        setTransporters(t);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [loadAdvice, loadCargo]);

  useEffect(() => {
    // A completed/ready advice can be revisited at any step.
    if (advice?.status === 'Ready' || advice?.status === 'Completed') {
      setFurthestIndex(STEPS.length - 1);
    }
  }, [advice?.status]);

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

  const goToStep = (key) => setStepKey(key);
  const goNext = () => {
    const i = STEPS.findIndex((s) => s.key === stepKey);
    const next = STEPS[Math.min(i + 1, STEPS.length - 1)];
    setFurthestIndex((f) => Math.max(f, i + 1));
    setStepKey(next.key);
  };
  const goBack = () => {
    const i = STEPS.findIndex((s) => s.key === stepKey);
    setStepKey(STEPS[Math.max(i - 1, 0)].key);
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;

  const summary = computeInboundSummary(advice, cargoRows);
  const stepProps = {
    advice,
    cargoRows,
    customers,
    transporters,
    patchAdvice,
    reloadCargo: loadCargo,
    goNext,
    goBack,
    saving,
    setError,
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>New Inbound</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            Create a new inbound and confirm unloading
          </p>
        </div>
        <Link className="link-btn" to="/inbound">
          &larr; Back to Inbound Operations
        </Link>
      </div>

      {error && <div className="error-text">{error}</div>}

      <Stepper steps={STEPS} currentKey={stepKey} furthestIndex={furthestIndex} onStepClick={goToStep} />

      <div className="wizard-layout">
        <div className="wizard-main">
          {stepKey === 'general' && <StepGeneral {...stepProps} />}
          {stepKey === 'goods' && <StepGoods {...stepProps} />}
          {stepKey === 'documents' && <StepDocuments {...stepProps} />}
          {stepKey === 'check' && <StepCheck {...stepProps} goToStep={goToStep} />}
          {stepKey === 'finish' && <StepFinish {...stepProps} />}
        </div>

        <div className="wizard-sidebar">
          <div className="card">
            <h3>Status</h3>
            <div style={{ marginBottom: 10 }}>
              <span className={`status-badge ${advice.status === 'Ready' ? 'status-ready' : ''} ${advice.status === 'Completed' ? 'status-completed' : ''}`}>
                {advice.status === 'Ready' ? 'Inbound Ready' : advice.status === 'Completed' ? 'Completed' : 'Pending'}
              </span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Inbound Number</span>
              <span>{advice.inbound_reference || '—'}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Status</span>
              <span>{advice.status}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Created On</span>
              <span>{advice.CREATEDTIME || '—'}</span>
            </div>
          </div>

          <div className="card">
            <h3>Inbound Summary</h3>
            <div className="sidebar-kv">
              <span className="muted small">Expected Colli</span>
              <span>{summary.expectedColli}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Received Pieces (Inner)</span>
              <span>{summary.receivedPieces}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Total Outer Packages</span>
              <span>{summary.totalOuterPackages}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Total Weight</span>
              <span>{summary.totalWeight.toFixed(2)} kg</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Total Volume</span>
              <span>{summary.totalVolume.toFixed(3)} m³</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Pallets</span>
              <span>{summary.pallets}</span>
            </div>
            <div className="sidebar-kv">
              <span className="muted small">Items</span>
              <span>{summary.items}</span>
            </div>
          </div>

          <div className="card">
            <h3>Quick Actions</h3>
            <div className="form-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {(advice.status === 'Ready' || advice.status === 'Completed') && (
                <a
                  className="btn secondary"
                  href={`${import.meta.env.BASE_URL}print/putaway/${adviceId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Reprint Labels
                </a>
              )}
              <button className="btn secondary" disabled={saving} onClick={() => navigate('/inbound')} title="Fields save automatically as you go">
                Save as Draft
              </button>
              <button className="btn secondary" onClick={() => navigate('/inbound')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
