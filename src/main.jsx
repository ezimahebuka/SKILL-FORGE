import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import Welcome from "./components/Welcome";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import Quiz from "./components/Quiz";
import Results from "./components/Results";
import Admin from "./components/Admin";
import "./styles.css";

if ("serviceWorker" in navigator && window.location.protocol === "http:") {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js"),
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [dashboardQuiz, setDashboardQuiz] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [result, setResult] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const navigate = (nextPath) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  };
  useEffect(() => {
    const handleBack = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);
  useEffect(() => {
    if (!authChecked || !user) return;
    api("/quizzes")
      .then(async ({ quizzes }) => {
        if (!quizzes[0]) return;
        const data = await api(`/quizzes/${quizzes[0]._id}`);
        setDashboardQuiz(data.quiz);
      })
      .catch(() => {});
  }, [authChecked, user]);
  useEffect(() => {
    api("/auth/me")
      .then((data) => {
        setUser(data.user);
        if (path === "/" || path === "/login" || path === "/register")
          navigate("/dashboard");
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);
  useEffect(() => {
    if (path.startsWith("/results/") && !result && authChecked && user) {
      api(`/results/${path.split("/")[2]}`)
        .then((data) => setResult(data.result))
        .catch(() => {});
    }
  }, [path, authChecked, user, result]);
  const login = (loggedIn) => {
    setUser(loggedIn);
    navigate("/dashboard");
  };
  const start = async () => {
    const quizToStart = dashboardQuiz || (await api("/quizzes")).quizzes[0];
    if (!quizToStart) return;
    setQuiz(await api(`/quizzes/${quizToStart._id}/start`, { method: "POST" }));
    navigate("/quiz");
  };
  const finish = async (attemptId, answers) => {
    try {
      const response = await api(`/quizzes/${quiz.quiz._id}/submit`, {
        method: "POST",
        body: JSON.stringify({ attemptId, answers }),
      });
      setResult((await api(`/results/${response.attemptId}`)).result);
      navigate(`/results/${response.attemptId}`);
    } catch {
      setQuiz(null);
      navigate("/dashboard");
    }
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setQuiz(null);
    setResult(null);
    navigate("/login");
  };
  if (path === "/") return <Welcome go={(page) => navigate(`/${page}`)} />;
  if (path === "/login" || path === "/register")
    return (
      <Auth
        mode={path.slice(1)}
        setMode={(mode) => navigate(`/${mode}`)}
        onLogin={login}
      />
    );
  if (!authChecked) return <div className="loading">Loading...</div>;
  if (!user)
    return (
      <Auth
        mode="login"
        setMode={(mode) => navigate(`/${mode}`)}
        onLogin={login}
      />
    );
  if (path === "/quiz")
    return quiz ? (
      <Quiz data={quiz} finish={finish} />
    ) : (
      <div className="loading">Loading quiz...</div>
    );
  if (path.startsWith("/results/"))
    return result ? (
      <Results result={result} back={() => navigate("/dashboard")} />
    ) : (
      <div className="loading">Loading result...</div>
    );
  if (path === "/admin")
    return user.role === "admin" ? (
      <Admin back={() => navigate("/dashboard")} />
    ) : (
      <Dashboard
        user={user}
        quiz={dashboardQuiz}
        start={start}
        admin={() => {}}
        logout={logout}
      />
    );
  if (path !== "/dashboard")
    return <Welcome go={(page) => navigate(`/${page}`)} />;
  return (
    <Dashboard
      user={user}
      quiz={dashboardQuiz}
      start={start}
      admin={() => user.role === "admin" && navigate("/admin")}
      logout={logout}
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
