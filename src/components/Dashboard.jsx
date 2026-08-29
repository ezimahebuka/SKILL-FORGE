import { useState } from "react";
import Button from "./Button";
import Brand from "./Brand";
import RecordingConsent from "./RecordingConsent";

export default function Dashboard({
  user,
  quiz,
  start,
  admin,
  logout,
  recordingError,
}) {
  const [showConsent, setShowConsent] = useState(false);
  return (
    <main className="app-shell">
      <header>
        <Brand />
        <div className="user-chip">
          {user.fullName}
          {user.role === "admin" && <button onClick={admin}>Admin →</button>}
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <section className="dashboard">
        <span className="kicker">YOUR DASHBOARD / READY?</span>
        <h1>One question at a time.</h1>
        <p className="lede">
          A quick, focused challenge designed to test what you know and reveal
          what to learn next.
        </p>
        {recordingError && <div className="notice">{recordingError}</div>}
        <div className="quiz-card">
          <div>
            <span className="label">FEATURED QUIZ</span>
            <h2>{quiz?.title || "Loading quiz..."}</h2>
            <p>{quiz?.description || "Loading quiz details..."}</p>
            <div className="stats">
              <span>
                <b>{quiz?.questionCount ?? "-"}</b> questions
              </span>
              <span>
                <b>30 sec</b> per question
              </span>
            </div>
          </div>
          <Button onClick={() => setShowConsent(true)}>
            Start quiz <span>→</span>
          </Button>
        </div>
      </section>
      {showConsent && (
        <RecordingConsent
          onCancel={() => setShowConsent(false)}
          onContinue={() => {
            setShowConsent(false);
            start();
          }}
        />
      )}
    </main>
  );
}
