import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import Brand from "./Brand";
import ExitQuizModal from "./ExitQuizModal";

export default function Quiz({ data, finish }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState([]);
  const [seconds, setSeconds] = useState(30);
  const [showExitModal, setShowExitModal] = useState(false);
  const advancing = useRef(false);
  const question = data.questions[index];
  useEffect(() => {
    setSeconds(30);
    setAnswer("");
    advancing.current = false;
  }, [index]);
  useEffect(() => {
    if (seconds <= 0) {
      advance("");
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [seconds]);
  const advance = (value) => {
    if (advancing.current) return;
    advancing.current = true;
    const next = [
      ...answers.filter((item) => item.questionId !== question._id),
      { questionId: question._id, answer: value },
    ];
    setAnswers(next);
    if (index === data.questions.length - 1) finish(data.attemptId, next);
    else setIndex(index + 1);
  };
  const confirmExit = (event) => {
    event.preventDefault();
    setShowExitModal(true);
  };
  const endQuiz = () => {
    window.location.href = "/";
  };
  if (!question)
    return <div className="loading">No questions have been added yet.</div>;
  return (
    <main className="quiz">
      <header>
        <Brand onClick={confirmExit} />
        <span
          className={`timer ${seconds < 20 ? "warning" : ""} ${seconds < 10 ? "critical" : ""}`}
        >
          {String(seconds).padStart(2, "0")} <small>SEC</small>
        </span>
      </header>
      <div className="progress">
        <span
          style={{ width: `${((index + 1) / data.questions.length) * 100}%` }}
        />
      </div>
      <section className="question">
        <div className="question-meta">
          <span>
            QUESTION {String(index + 1).padStart(2, "0")} /{" "}
            {String(data.questions.length).padStart(2, "0")}
          </span>
          <span>
            {Math.round(((index + 1) / data.questions.length) * 100)}%
          </span>
        </div>
        <h1>{question.questionText}</h1>
        {question.questionType === "multiple_choice" ? (
          <div className="options">
            {question.options.map((option, optionIndex) => (
              <button
                className={answer === option ? "option selected" : "option"}
                key={option}
                onClick={() => setAnswer(option)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <input
            className="answer-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            autoFocus
          />
        )}
      </section>
      <footer>
        <span>
          {seconds < 20
            ? "Time is running short."
            : "Take your time. Trust your first thought."}
        </span>
        <Button onClick={() => advance(answer)}>
          {index === data.questions.length - 1
            ? "Finish quiz"
            : "Next question"}{" "}
          <span>→</span>
        </Button>
      </footer>
      {showExitModal && (
        <ExitQuizModal
          onCancel={() => setShowExitModal(false)}
          onConfirm={endQuiz}
        />
      )}
    </main>
  );
}
