import Button from "./Button";

export default function ExitQuizModal({ onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="exit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-quiz-title"
      >
        <span className="kicker">LEAVE QUIZ</span>
        <h2 id="exit-quiz-title">End this quiz?</h2>
        <p>Your current progress will not be submitted.</p>
        <div className="modal-actions">
          <button className="text-button" onClick={onCancel}>
            Continue quiz
          </button>
          <Button onClick={onConfirm}>
            End quiz <span>→</span>
          </Button>
        </div>
      </section>
    </div>
  );
}
