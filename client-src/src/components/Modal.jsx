// Generic popup wrapper used by the Inbound stage popups (and anywhere else
// that needs a modal) -- built on the same .modal-overlay/.modal-card CSS
// already proven by QrScannerModal.
export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card${wide ? ' modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
