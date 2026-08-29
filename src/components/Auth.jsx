import { useState } from "react";
import { api } from "../api";
import Button from "./Button";
import Brand from "./Brand";

export default function Auth({ mode, setMode, onLogin }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (mode === "login") onLogin(data.user);
      else {
        setMode("login");
        setError("Account created. You can sign in now.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth">
      <div className="auth-intro">
        <Brand full />
        <span className="kicker">SKILL FORGE</span>
        <h1>{mode === "login" ? "Welcome back." : "Join the room."}</h1>
        <p>
          {mode === "login"
            ? "Your next question is waiting."
            : "Your administrator must approve your email before you can register."}
        </p>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        {mode === "register" && (
          <label>
            Full name
            <input
              required
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {mode === "register" && (
          <label>
            Confirm password
            <input
              type="password"
              required
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
            />
          </label>
        )}
        {error && <div className="notice">{error}</div>}
        <Button disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "login"
              ? "Sign in →"
              : "Create account →"}
        </Button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already registered? Sign in"}
        </button>
      </form>
    </main>
  );
}
