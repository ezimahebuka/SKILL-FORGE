import Button from "./Button";
import Brand from "./Brand";

export default function Results({ result, back }) {
  return (
    <main className="app-shell">
      <header>
        <Brand />
        <Button onClick={back}>Back to dashboard</Button>
      </header>
      <section className="results">
        <span className="kicker">QUIZ COMPLETE / WELL DONE</span>
        <h1>{result.percentage}%</h1>
        <p className="lede">
          You scored {result.correctAnswers} out of{" "}
          {result.gradedQuestions ?? result.totalQuestions} automatically graded
          questions in {result.quiz.title}.
          {result.pendingReview > 0 &&
            ` ${result.pendingReview} written response(s) are pending facilitator review.`}
        </p>
        <div className="result-grid">
          <div>
            <b>{result.correctAnswers}</b>
            <span>Correct</span>
          </div>
          <div>
            <b>{result.incorrectAnswers}</b>
            <span>Incorrect</span>
          </div>
          <div>
            <b>{result.unanswered}</b>
            <span>Unanswered</span>
          </div>
          {result.pendingReview > 0 && (
            <div>
              <b>{result.pendingReview}</b>
              <span>Pending review</span>
            </div>
          )}
        </div>
        <h2>Review answers</h2>
        <div className="review">
          {result.answers.map((item) => {
            const pendingReview =
              item.requiresManualGrading || item.question.requiresManualGrading;
            return (
              <article
                key={item.questionId}
                className={
                  pendingReview
                    ? "pending-review"
                    : item.isCorrect
                      ? "correct"
                      : "incorrect"
                }
              >
                <span>
                  {pendingReview
                    ? "PENDING REVIEW"
                    : item.isCorrect
                      ? "CORRECT"
                      : "REVIEW"}
                </span>
                <h3>{item.question.questionText}</h3>
                <p>
                  Your answer: <strong>{item.answer || "Not answered"}</strong>
                </p>
                {!pendingReview &&
                  !item.isCorrect &&
                  item.question.correctAnswer && (
                    <p>
                      Correct answer: <strong>{item.question.correctAnswer}</strong>
                    </p>
                  )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
