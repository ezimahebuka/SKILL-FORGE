import Button from "./Button";

export default function RecordingConsent({ onCancel, onContinue }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="exit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-title"
      >
        <span className="kicker">SECURE QUIZ SESSION</span>
        <h2 id="recording-title">Camera and screen check</h2>
        <p>
          To protect quiz integrity, Skill Forge will record your webcam and the
          screen you choose. Your browser will ask for permission, and recording
          stops when you finish.
        </p>
        <div className="modal-actions">
          <button className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <Button onClick={onContinue}>
            Allow recording <span>→</span>
          </Button>
        </div>
      </section>
    </div>
  );
}
