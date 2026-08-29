import Button from "./Button";

export default function ConfirmModal({
  title,
  message,
  onCancel,
  onConfirm,
  busy,
  confirmLabel = "Delete user",
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="exit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <span className="kicker">CONFIRM ACTION</span>
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="text-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
