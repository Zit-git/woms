import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getInboundAdviceById,
  editInboundAdvice,
  listCargoByAdvice,
  listCustomers,
  listTransporters,
  listSuppliers,
} from '../../lib/api';
import Stepper from '../../components/Stepper';
import StepGeneral from './steps/StepGeneral';
import StepGoods from './steps/StepGoods';
import StepDocuments from './steps/StepDocuments';
import StepCheck from './steps/StepCheck';
import StepFinish from './steps/StepFinish';
import InboundSidebar from './InboundSidebar';
import { computeInboundSummary } from '../../lib/inboundSummary';

const STEPS = [
  { key: 'general', label: 'General', sublabel: 'Arrival details' },
  { key: 'goods', label: 'Line Items', sublabel: 'Add cargo lines' },
  { key: 'documents', label: 'Documents', sublabel: 'Upload files' },
  { key: 'check', label: 'Check', sublabel: 'Verify information' },
  { key: 'finish', label: 'Finish', sublabel: 'Complete inbound' },
];

// The step-by-step intake workflow -- separate page/route from InboundMaster
// (the plain record view). This component is only ever the wizard; it does
// not also render a read-only summary internally.
export default function InboundWizard() {
  const { adviceId } = useParams();

  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
    Promise.all([loadAdvice(), loadCargo(), listCustomers(), listTransporters(), listSuppliers()])
      .then(([, , c, t, s]) => {
        setCustomers(c);
        setTransporters(t);
        setSuppliers(s);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [loadAdvice, loadCargo]);

  useEffect(() => {
    // A completed/ready advice being re-edited can be revisited at any step.
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
    suppliers,
    reloadSuppliers: () => listSuppliers().then(setSuppliers),
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
          <h2>{advice.inbound_reference ? `Editing ${advice.inbound_reference}` : 'New Inbound'}</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            Create a new inbound and confirm unloading
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link className="link-btn" to={`/inbound/${adviceId}`}>
            &larr; Back to Inbound Master
          </Link>
          <Link className="link-btn" to="/inbound">
            &larr; Back to Inbound Operations
          </Link>
        </div>
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

        <InboundSidebar advice={advice} summary={summary} adviceId={adviceId} saving={saving} />
      </div>
    </div>
  );
}
