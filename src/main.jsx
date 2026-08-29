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
  const [recordingStreams, setRecordingStreams] = useState(null);
  const [recordingError, setRecordingError] = useState("");
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
    try {
      const camera = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      let screen;
      try {
        screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      } catch (error) {
        camera.getTracks().forEach((track) => track.stop());
        throw error;
      }
      const quizToStart = dashboardQuiz || (await api("/quizzes")).quizzes[0];
      if (!quizToStart) return;
      setRecordingError("");
      setRecordingStreams({ camera, screen });
      setQuiz(
        await api(`/quizzes/${quizToStart._id}/start`, { method: "POST" }),
      );
      navigate("/quiz");
    } catch {
      setRecordingError(
        "Camera and screen permission are required to start this quiz.",
      );
    }
  };
  const finish = async (attemptId, answers, recordingPromise) => {
    try {
      const response = await api(`/quizzes/${quiz.quiz._id}/submit`, {
        method: "POST",
        body: JSON.stringify({ attemptId, answers }),
      });
      const completedResult = (await api(`/results/${response.attemptId}`))
        .result;
      const recording = recordingPromise ? await recordingPromise : null;
      if (recording) {
        try {
          const signature = await api("/uploads/video-signature");
          const formData = new FormData();
          formData.append("file", recording, "skillforge-quiz.webm");
          formData.append("api_key", signature.apiKey);
          formData.append("timestamp", signature.timestamp);
          formData.append("folder", signature.folder);
          formData.append("signature", signature.signature);
          const uploadResponse = await fetch(
            `https://api.cloudinary.com/v1_1/${signature.cloudName}/video/upload`,
            { method: "POST", body: formData },
          );
          const uploaded = await uploadResponse.json();
          if (!uploadResponse.ok)
            throw new Error(uploaded.error?.message || "Video upload failed.");
          await api(
            `/quizzes/${quiz.quiz._id}/attempts/${response.attemptId}/video`,
            {
              method: "PATCH",
              body: JSON.stringify({
                videoUrl: uploaded.secure_url,
                videoPublicId: uploaded.public_id,
              }),
            },
          );
        } catch (error) {
          console.error("Quiz recording upload failed:", error.message);
        }
      }
      setResult(completedResult);
      navigate(`/results/${response.attemptId}`);
    } catch {
      setQuiz(null);
      recordingStreams?.camera.getTracks().forEach((track) => track.stop());
      recordingStreams?.screen.getTracks().forEach((track) => track.stop());
      setRecordingStreams(null);
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
      <Quiz data={quiz} finish={finish} streams={recordingStreams} />
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
        recordingError={recordingError}
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
      recordingError={recordingError}
      start={start}
      admin={() => user.role === "admin" && navigate("/admin")}
      logout={logout}
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
