// Generic N-step progress indicator. `steps` is [{ key, label, sublabel }],
// `currentKey` is the active step, `furthestIndex` is the highest step the
// user has already reached (used only to mark steps as "done" -- every step
// is freely clickable regardless, so users can fill in basic details and
// jump back and forth instead of being forced through a strict sequence).
export default function Stepper({ steps, currentKey, furthestIndex, onStepClick }) {
  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return (
    <div className="stepper">
      {steps.map((step, i) => {
        const done = i < currentIndex || i < furthestIndex;
        const active = i === currentIndex;
        const clickable = !active;
        return (
          <div className="stepper-item" key={step.key}>
            <button
              type="button"
              className={`stepper-circle ${done ? 'done' : ''} ${active ? 'active' : ''}`}
              onClick={() => clickable && onStepClick(step.key)}
              disabled={!clickable}
            >
              {done ? '✓' : i + 1}
            </button>
            <div className="stepper-label">
              <div className={`stepper-title ${active || done ? 'clickable-title' : ''}`}>{step.label}</div>
              <div className="stepper-sublabel muted small">{step.sublabel}</div>
            </div>
            {i < steps.length - 1 && <div className={`stepper-connector ${done ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}
