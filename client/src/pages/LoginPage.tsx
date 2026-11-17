import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import Notice from "../components/Notice";
import OAuthButtons from "../components/OAuthButtons";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import type { AuthResponse } from "../utils/types";

type Mode = "login" | "register" | "forgot";

function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const routeState = location.state as { from?: string; notice?: string; noticeKind?: "error" | "info" } | null;
  const goBackTo = routeState?.from ?? "/";

  // The URL decides the mode (/login, /login?mode=register, /login?mode=forgot), so the navbar
  // links and the links under the form all work, even while this page is already showing.
  const modeParam = params.get("mode");
  const mode: Mode = modeParam === "register" ? "register" : modeParam === "forgot" ? "forgot" : "login";
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Set when the account exists but its email is not verified yet
  const [needsVerification, setNeedsVerification] = useState(false);

  // When the mode changes (from the navbar or the links below), clear the old messages.
  // Email stays filled in so people don't have to retype it.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setError("");
    setMessage("");
    setNeedsVerification(false);
  }

  if (user) return <Navigate to={goBackTo} replace />;

  function switchMode(next: Mode) {
    // Keep location.state so "log in, then go back to where you were" still works
    setParams(next === "login" ? {} : { mode: next }, { replace: true, state: location.state });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setNeedsVerification(false);

    if (mode === "login") {
      const res = await apiFetch<AuthResponse>("api/auth/login", { method: "POST", body: { email, password } });
      if (res.ok) {
        signIn({ token: res.data.token, user: res.data.user });
      } else {
        setError(res.error ?? "Could not log in");
        setNeedsVerification(res.code === "EMAIL_NOT_VERIFIED");
      }
    } else if (mode === "register") {
      const res = await apiFetch<{ message: string }>("api/auth/register", {
        method: "POST",
        body: { username, email, password },
      });
      if (res.ok) {
        setMessage("Account created. Check your inbox for a link to verify your email, then log in.");
        setNeedsVerification(true);
      } else {
        setError(res.error ?? "Could not create the account");
      }
    } else {
      const res = await apiFetch<{ message: string }>("api/auth/forgot-password", { method: "POST", body: { email } });
      if (res.ok) setMessage(res.data.message);
      else setError(res.error ?? "Could not send the reset link");
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true);
    const res = await apiFetch<{ message: string }>("api/auth/resend-verification", { method: "POST", body: { email } });
    setBusy(false);
    if (res.ok) {
      setError("");
      setMessage(res.data.message);
    } else {
      setError(res.error ?? "Could not send a new link");
    }
  }

  const title = mode === "login" ? "Log in" : mode === "register" ? "Create your account" : "Reset your password";
  const action = mode === "login" ? "Log in" : mode === "register" ? "Sign up" : "Send reset link";

  return (
    <main className="page d-flex justify-content-center">
      <div className="panel w-100" style={{ maxWidth: 440 }}>
        <h1 className="h3 mb-4">{title}</h1>

        {routeState?.notice && <Notice kind={routeState.noticeKind === "error" ? "error" : "info"}>{routeState.notice}</Notice>}

        {mode !== "forgot" && <OAuthButtons from={routeState?.from} />}

        <form onSubmit={submit} noValidate={false}>
          {mode === "register" && (
            <div className="mb-3">
              <label htmlFor="username" className="form-label fw-semibold">Username</label>
              <input
                id="username"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                pattern="[A-Za-z0-9_]{3,20}"
                title="3 to 20 letters, numbers or underscores"
                required
              />
              <div className="form-text">3 to 20 letters, numbers or underscores.</div>
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="email" className="form-label fw-semibold">Email</label>
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {mode !== "forgot" && (
            <div className="mb-3">
              <label htmlFor="password" className="form-label fw-semibold">Password</label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                maxLength={mode === "register" ? 72 : undefined}
                required
              />
              {mode === "register" && <div className="form-text">8 to 72 characters.</div>}
            </div>
          )}

          {error && <Notice kind="error">{error}</Notice>}
          {message && <Notice kind="success">{message}</Notice>}

          {needsVerification && email && (
            <p className="small">
              Didn't get the email?{" "}
              <button type="button" className="btn btn-link p-0 align-baseline" onClick={resend} disabled={busy}>
                Send a new link
              </button>
            </p>
          )}

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? "Please wait…" : action}
          </button>

          {mode === "register" && (
            <p className="small muted mt-3 mb-0">
              By signing up you agree to the <Link to="/terms">terms</Link> and accept the <Link to="/privacy">privacy policy</Link>.
            </p>
          )}
        </form>

        <div className="mt-4 small d-flex flex-column gap-1">
          {mode !== "login" && (
            <button type="button" className="btn btn-link p-0 text-start" onClick={() => switchMode("login")}>
              I already have an account
            </button>
          )}
          {mode !== "register" && (
            <button type="button" className="btn btn-link p-0 text-start" onClick={() => switchMode("register")}>
              Create an account
            </button>
          )}
          {mode === "login" && (
            <button type="button" className="btn btn-link p-0 text-start" onClick={() => switchMode("forgot")}>
              Forgot your password?
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default LoginPage;
