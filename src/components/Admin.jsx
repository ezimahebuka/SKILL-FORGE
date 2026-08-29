import { useEffect, useState } from "react";
import { api } from "../api";
import Table from "./Table";
import Brand from "./Brand";
import ConfirmModal from "./ConfirmModal";

export default function Admin({ back }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [results, setResults] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    questionType: "multiple_choice",
    options: ["", "", "", ""],
  });
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resultDeleteTarget, setResultDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
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
      setMessage(`${response.imported} question(s) imported successfully.`);
      await refreshQuestions();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
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
        <span className="kicker">CONTROL ROOM / ADMIN</span>
        <h1>Keep the quiz sharp.</h1>
        <nav>
          {["overview", "users", "questions", "results"].map((item) => (
            <button
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </nav>
        {message && <div className="notice">{message}</div>}
        {tab === "overview" && stats && (
          <div className="metric-grid">
            {[
              ["Users", stats.users],
              ["Completed attempts", stats.attempts],
              ["Questions", stats.questions],
              ["Average score", `${stats.average}%`],
              ["Highest score", `${stats.highest}%`],
            ].map((item) => (
              <div className="metric" key={item[0]}>
                <span>{item[0]}</span>
                <b>{item[1]}</b>
              </div>
            ))}
          </div>
        )}
        {tab === "users" && (
          <Table
            headers={["Name", "Email", "Role", "Status", "Actions"]}
            rows={users.map((user) => [
              user.fullName,
              user.email,
              user.role,
              user.isDisabled ? "Disabled" : "Active",
              <button
                className="table-action"
                onClick={() => setDeleteTarget(user)}
              >
                Delete
              </button>,
            ])}
          />
        )}
        {tab === "results" && (
          <Table
            headers={["User", "Quiz", "Score", "Completed", "Actions"]}
            rows={results.map((item) => [
              item.userId?.fullName,
              item.quizId?.title,
              `${item.correctAnswers} / ${item.totalQuestions} (${item.percentage}%)`,
              new Date(item.completedAt).toLocaleDateString(),
              <button
                className="table-action"
                onClick={() => setResultDeleteTarget(item)}
              >
                Delete
              </button>,
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
                Correct answer
                <input
                  required
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
                CSV content
                <textarea
                  required
                  value={csv}
                  onChange={(event) => setCsv(event.target.value)}
                  placeholder="Paste CSV rows here..."
                />
              </label>
              <button className="button" disabled={saving}>
                {saving ? "Importing..." : "Import questions →"}
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
    </main>
  );
}
