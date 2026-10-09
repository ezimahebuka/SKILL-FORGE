import Button from "./Button";

export default function AlertModal({ title, message, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="exit-modal alert-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby="alert-message"
      >
        <span className="kicker">CSV IMPORT</span>
        <h2 id="alert-title">{title}</h2>
        <p id="alert-message">{message}</p>
        <div className="modal-actions alert-actions">
          <Button autoFocus onClick={onClose}>
            OK
          </Button>
        </div>
      </section>
    </div>
  );
}
