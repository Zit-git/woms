import QrCodeImage from './QrCodeImage';

// One cuttable Handling Unit label: QR, the HU number to read out, what is in it, and the code to type
// when the QR cannot be scanned.
export default function HuLabel({ number, description, quantity, unit, weight, customer, location, code }) {
  return (
    <div className="label-card">
      <QrCodeImage value={code} size={110} />
      <div className="label-desc">
        <strong>{number}</strong>
      </div>
      {customer && <div className="small">{customer}</div>}
      <div className="small">{description}</div>
      <div className="muted small">{[quantity && unit ? `${quantity} ${unit}` : unit, weight ? `${weight} kg` : ''].filter(Boolean).join(' · ')}</div>
      {location && <div className="small">Location {location}</div>}
      <div className="muted small">{code}</div>
    </div>
  );
}
