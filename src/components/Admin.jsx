import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import Table from "./Table";
import Brand from "./Brand";
import ConfirmModal from "./ConfirmModal";
import AlertModal from "./AlertModal";
import { TRACK_LABELS, TRACK_OPTIONS } from "../tracks";

export default function Admin({ user, trackName, back }) {
  const isGlobalAdmin = user?.role === "admin";
  const isFacilitator = user?.role === "facilitator";
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [results, setResults] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [form, setForm] = useState({
    questionType: "multiple_choice",
    options: ["", "", "", ""],
  });
  const [csv, setCsv] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [readingCsv, setReadingCsv] = useState(false);
  const csvFileInput = useRef(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resultDeleteTarget, setResultDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [quizForm, setQuizForm] = useState({
    title: "",
    description: "",
    track: isFacilitator ? user.track : "",
  });
  useEffect(() => {
    Promise.all([
      api("/admin/stats"),
      api("/admin/users"),
      api("/admin/results"),
      api("/admin/quizzes"),
      api("/admin/questions"),
    ])
      .then(([a, b, c, d, e]) => {
        setStats(a.stats);
        setUsers(b.users);
        setResults(c.results);
        setQuizzes(d.quizzes);
        setQuestions(e.questions);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const updateOption = (index, value) =>
    setForm({
      ...form,
      options: form.options.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    });
  const refreshQuestions = async () =>
    setQuestions((await api("/admin/questions")).questions);
  const deleteUser = async () => {
    setDeleting(true);
    setMessage("");
    try {
      await api(`/admin/users/${deleteTarget._id}`, { method: "DELETE" });
      setUsers((currentUsers) =>
        currentUsers.filter((user) => user._id !== deleteTarget._id),
      );
      setDeleteTarget(null);
      setMessage("User deleted successfully.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setDeleting(false);
    }
  };
  const deleteResult = async () => {
    setDeleting(true);
    setMessage("");
    try {
      await api(`/admin/results/${resultDeleteTarget._id}`, {
        method: "DELETE",
      });
      setResults((currentResults) =>
        currentResults.filter(
          (result) => result._id !== resultDeleteTarget._id,
        ),
      );
      setResultDeleteTarget(null);
      setMessage("Result deleted successfully.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setDeleting(false);
    }
  };
  const createQuiz = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await api("/admin/quizzes", {
        method: "POST",
        body: JSON.stringify(
          isGlobalAdmin
            ? quizForm
            : { title: quizForm.title, description: quizForm.description },
        ),
      });
      setQuizzes((currentQuizzes) => [response.quiz, ...currentQuizzes]);
      setQuizForm({
        title: "",
        description: "",
        track: isFacilitator ? user.track : "",
      });
      setMessage("Quiz created successfully.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };
  const toggleQuiz = async (quiz) => {
    try {
      const response = await api(`/admin/quizzes/${quiz._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !quiz.isActive }),
      });
      setQuizzes((currentQuizzes) =>
        currentQuizzes.map((item) =>
          item._id === quiz._id ? response.quiz : item,
        ),
      );
    } catch (e) {
      setMessage(e.message);
    }
  };
  const updateQuizTrack = async (quiz, track) => {
    try {
      const response = await api(`/admin/quizzes/${quiz._id}`, {
        method: "PATCH",
        body: JSON.stringify({ track }),
      });
      setQuizzes((currentQuizzes) =>
        currentQuizzes.map((item) =>
          item._id === quiz._id ? response.quiz : item,
        ),
      );
      setMessage("Quiz learning track updated.");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const updateUserTrack = async (user, track) => {
    try {
      const response = await api(`/admin/users/${user._id}`, {
        method: "PATCH",
        body: JSON.stringify({ track }),
      });
      setUsers((currentUsers) =>
        currentUsers.map((item) =>
          item._id === user._id ? response.user : item,
        ),
      );
      setMessage("Student learning track updated.");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const updateUserStatus = async (user) => {
    try {
      const response = await api(`/admin/users/${user._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isApproved: user.isApproved || !user.isApproved,
          isDisabled: user.isApproved ? !user.isDisabled : false,
        }),
      });
      setUsers((currentUsers) =>
        currentUsers.map((item) =>
          item._id === user._id ? response.user : item,
        ),
      );
    } catch (e) {
      setMessage(e.message);
    }
  };
  const createQuestion = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api("/admin/questions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          options:
            form.questionType === "text" ? [] : form.options.filter(Boolean),
        }),
      });
      setForm({ questionType: "multiple_choice", options: ["", "", "", ""] });
      setMessage("Question saved successfully.");
      await refreshQuestions();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };
  const importQuestions = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await api("/admin/questions/import", {
        method: "POST",
        body: JSON.stringify({ csv, quizId: form.quizId }),
      });
      setCsv("");
      setCsvFileName("");
      if (csvFileInput.current) csvFileInput.current.value = "";
      setAlertMessage(
        [
          `${response.imported} question(s) imported successfully.`,
          ...(response.warnings || []),
        ].join(" "),
      );
      await refreshQuestions();
    } catch (e) {
      setAlertMessage(e.message);
    } finally {
      setSaving(false);
    }
  };
  const readCSVFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAlertMessage("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setAlertMessage("Choose a .csv file.");
      event.target.value = "";
      return;
    }
    if (file.size > 700 * 1024) {
      setAlertMessage("CSV files must be smaller than 700 KB.");
      event.target.value = "";
      return;
    }
    setReadingCsv(true);
    try {
      setCsv(await file.text());
      setCsvFileName(file.name);
      setAlertMessage("");
    } catch {
      setAlertMessage("The selected CSV file could not be read.");
      event.target.value = "";
    } finally {
      setReadingCsv(false);
    }
  };
  return (
    <main className="app-shell">
      <header>
        <Brand />
        <button className="text-button" onClick={back}>
          ← Exit admin
        </button>
      </header>
      <section className="admin">
        <span className="kicker">
          {isGlobalAdmin
            ? "CONTROL ROOM / GLOBAL ADMIN"
            : `CONTROL ROOM / ${trackName || "TRACK UNASSIGNED"}`}
        </span>
        <h1>{isGlobalAdmin ? "Keep the quiz sharp." : "Track management."}</h1>
        <nav>
          {["overview", "users", "quizzes", "questions", "results"].map(
            (item) => (
              <button
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
                key={item}
              >
                {item}
              </button>
            ),
          )}
        </nav>
        {message && <div className="notice">{message}</div>}
        {tab === "overview" && stats && (
          <div className="metric-grid">
            {[
              [isGlobalAdmin ? "Students" : "Track students", stats.students],
              ["Active quizzes", stats.quizzes],
              ["Completed attempts", stats.attempts],
              ["Questions", stats.questions],
              ["Average score", `${stats.average}%`],
              ["Highest score", `${stats.highest}%`],
              ["Pass rate", `${stats.passRate}%`],
            ].map((item) => (
              <div className="metric" key={item[0]}>
                <span>{item[0]}</span>
                <b>{item[1]}</b>
              </div>
            ))}
          </div>
        )}
        {tab === "users" && (isGlobalAdmin || isFacilitator) && (
          <Table
            headers={
              isGlobalAdmin
                ? [
                    "Name",
                    "Email",
                    "Role",
                    "Learning track",
                    "Status",
                    "Actions",
                  ]
                : ["Student", "Email", "Learning track", "Status"]
            }
            rows={users.map((user) => [
              user.fullName,
              user.email,
              ...(isGlobalAdmin
                ? [
                    user.role,
                    ["user", "facilitator"].includes(user.role) ? (
                      <select
                        className="table-select"
                        aria-label={`Learning track for ${user.fullName}`}
                        value={user.track || ""}
                        onChange={(event) =>
                          updateUserTrack(user, event.target.value)
                        }
                      >
                        <option value="">Unassigned</option>
                        {TRACK_OPTIONS.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "-"
                    ),
                  ]
                : [TRACK_LABELS[user.track] || "Unassigned"]),
              user.isDisabled ? "Disabled" : "Active",
              ...(isGlobalAdmin
                ? [
                    <span className="table-actions">
                      <button
                        className="table-action"
                        onClick={() => updateUserStatus(user)}
                      >
                        {user.isApproved && !user.isDisabled
                          ? "Disable"
                          : user.isApproved
                            ? "Enable"
                            : "Approve"}
                      </button>
                      <button
                        className="table-action danger"
                        onClick={() => setDeleteTarget(user)}
                      >
                        Delete
                      </button>
                    </span>,
                  ]
                : []),
            ])}
          />
        )}
        {tab === "quizzes" && (
          <div className="quiz-admin">
            <form className="panel admin-form" onSubmit={createQuiz}>
              <h2>Create a quiz</h2>
              <label>
                Title
                <input
                  required
                  value={quizForm.title}
                  onChange={(event) =>
                    setQuizForm({ ...quizForm, title: event.target.value })
                  }
                  placeholder="e.g. HTML Foundations"
                />
              </label>
              <label>
                Description
                <textarea
                  required
                  value={quizForm.description}
                  onChange={(event) =>
                    setQuizForm({
                      ...quizForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="What will participants learn?"
                />
              </label>
              {isGlobalAdmin ? (
                <label>
                  Learning Track
                  <select
                    required
                    value={quizForm.track}
                    onChange={(event) =>
                      setQuizForm({ ...quizForm, track: event.target.value })
                    }
                  >
                    <option value="">Select learning track</option>
                    {TRACK_OPTIONS.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Learning Track
                  <input readOnly value={trackName || "Unassigned"} />
                </label>
              )}
              <button className="button" disabled={saving}>
                {saving ? "Creating..." : "Create quiz →"}
              </button>
            </form>
            <Table
              headers={[
                "Quiz",
                "Learning track",
                "Description",
                "Questions",
                "Status",
                "Actions",
              ]}
              rows={quizzes.map((quiz) => [
                quiz.title,
                isGlobalAdmin ? (
                  <select
                    className="table-select"
                    aria-label={`Learning track for ${quiz.title}`}
                    value={quiz.track || ""}
                    onChange={(event) =>
                      updateQuizTrack(quiz, event.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    {TRACK_OPTIONS.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  TRACK_LABELS[quiz.track] || "Unassigned"
                ),
                quiz.description,
                questions.filter(
                  (question) =>
                    String(question.quizId?._id || question.quizId) ===
                    String(quiz._id),
                ).length,
                quiz.isActive ? "Active" : "Inactive",
                <button
                  className="table-action"
                  onClick={() => toggleQuiz(quiz)}
                >
                  {quiz.isActive ? "Deactivate" : "Activate"}
                </button>,
              ])}
            />
          </div>
        )}
        {tab === "results" && (
          <Table
            headers={[
              "User",
              "Quiz",
              "Learning track",
              "Score",
              "Pending review",
              "Completed",
              "Recording",
              "Actions",
            ]}
            rows={results.map((item) => [
              item.userId?.fullName,
              item.quizId?.title,
              TRACK_LABELS[item.quizId?.track] || "Unassigned",
              `${item.correctAnswers} / ${item.gradedQuestions ?? item.totalQuestions} (${item.percentage}%)`,
              item.pendingReview || 0,
              new Date(item.completedAt).toLocaleDateString(),
              item.videoUrl ? (
                <a
                  className="table-action"
                  href={item.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Watch
                </a>
              ) : (
                "Not available"
              ),
              isGlobalAdmin ? (
                <button
                  className="table-action"
                  onClick={() => setResultDeleteTarget(item)}
                >
                  Delete
                </button>
              ) : (
                ""
              ),
            ])}
          />
        )}
        {tab === "questions" && (
          <div className="question-admin">
            <form className="panel admin-form" onSubmit={createQuestion}>
              <h2>Add a question</h2>
              <label>
                Quiz
                <select
                  required
                  value={form.quizId || ""}
                  onChange={(event) =>
                    setForm({ ...form, quizId: event.target.value })
                  }
                >
                  <option value="">Select quiz</option>
                  {quizzes.map((quiz) => (
                    <option value={quiz._id} key={quiz._id}>
                      {quiz.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Question type
                <select
                  value={form.questionType}
                  onChange={(event) =>
                    setForm({ ...form, questionType: event.target.value })
                  }
                >
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="text">Text answer</option>
                </select>
              </label>
              <label>
                Question text
                <textarea
                  required
                  value={form.questionText || ""}
                  onChange={(event) =>
                    setForm({ ...form, questionText: event.target.value })
                  }
                />
              </label>
              {form.questionType === "multiple_choice" && (
                <div className="option-fields">
                  {form.options.map((option, index) => (
                    <label key={index}>
                      Option {String.fromCharCode(65 + index)}
                      <input
                        required
                        value={option}
                        onChange={(event) =>
                          updateOption(index, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              <label>
                {form.questionType === "text"
                  ? "Correct answer (optional for manual review)"
                  : "Correct answer"}
                <input
                  required={form.questionType === "multiple_choice"}
                  value={form.correctAnswer || ""}
                  onChange={(event) =>
                    setForm({ ...form, correctAnswer: event.target.value })
                  }
                />
              </label>
              <button className="button" disabled={saving}>
                {saving ? "Saving..." : "Save question →"}
              </button>
            </form>
            <form className="panel admin-form" onSubmit={importQuestions}>
              <h2>Import CSV</h2>
              <p>Use the provided format for bulk questions.</p>
              <a href="/sample-questions.csv" download>
                Download sample CSV
              </a>
              <label>
                Quiz
                <select
                  required
                  value={form.quizId || ""}
                  onChange={(event) =>
                    setForm({ ...form, quizId: event.target.value })
                  }
                >
                  <option value="">Select quiz</option>
                  {quizzes.map((quiz) => (
                    <option value={quiz._id} key={quiz._id}>
                      {quiz.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Choose CSV file
                <input
                  ref={csvFileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={readCSVFile}
                  aria-label="Choose a CSV file to import"
                />
                {csvFileName && (
                  <span className="csv-file-name">Selected: {csvFileName}</span>
                )}
              </label>
              <label>
                CSV content
                <textarea
                  value={csv}
                  onChange={(event) => {
                    setCsv(event.target.value);
                    setCsvFileName("");
                  }}
                  placeholder="Choose a CSV file or paste CSV rows here..."
                />
              </label>
              <button
                className="button"
                disabled={saving || readingCsv || !csv.trim()}
              >
                {readingCsv
                  ? "Reading file..."
                  : saving
                    ? "Importing..."
                    : "Import questions →"}
              </button>
            </form>
            <Table
              headers={["Question", "Type", "Quiz"]}
              rows={questions.map((question) => [
                question.questionText,
                question.questionType,
                question.quizId?.title || "-",
              ])}
            />
          </div>
        )}
      </section>
      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.fullName}?`}
          message="This will permanently remove the account and its quiz attempts."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteUser}
          busy={deleting}
        />
      )}
      {resultDeleteTarget && (
        <ConfirmModal
          title="Delete this result?"
          message={`This will permanently remove ${resultDeleteTarget.userId?.fullName || "the user's"} quiz result.`}
          onCancel={() => setResultDeleteTarget(null)}
          onConfirm={deleteResult}
          busy={deleting}
          confirmLabel="Delete result"
        />
      )}
      {alertMessage && (
        <AlertModal
          title={
            alertMessage.includes("successfully")
              ? "Import complete"
              : "Import needs attention"
          }
          message={alertMessage}
          onClose={() => setAlertMessage("")}
        />
      )}
    </main>
  );
}
