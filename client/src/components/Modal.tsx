/**
 * Modal.tsx — a small, reusable popup dialog.
 *
 * Used for messages the player must acknowledge (e.g. "the host kicked you").
 * Clicking the dimmed backdrop OR the button closes it. We stop click events
 * inside the card from reaching the backdrop so a click on the card doesn't
 * accidentally dismiss it.
 */

interface Props {
  message: string;
  title?: string;
  closeLabel?: string;
  onClose: () => void;
}

export function Modal({ message, title = "Heads up", closeLabel = "Got it", onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <button className="primary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
