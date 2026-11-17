import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";

// The page the reset email links to: /reset-password?token=...
function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch<{ message: string }>("api/auth/reset-password", {
      method: "POST",
      body: { token, password },
    });
    if (res.ok) setDone(true);
    else setError(res.error ?? "Could not reset your password");
    setBusy(false);
  }

  return (
    <main className="page d-flex justify-content-center">
      <div className="panel w-100" style={{ maxWidth: 440 }}>
        <h1 className="h3 mb-4">Choose a new password</h1>
        {!token ? (
          <Notice kind="error">This link is missing its token. Open the link from your email again.</Notice>
        ) : done ? (
          <>
            <Notice kind="success">Password updated.</Notice>
            <Link to="/login" className="btn btn-primary w-100">Log in</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="mb-3">
              <label htmlFor="newPassword" className="form-label fw-semibold">New password</label>
              <input
                id="newPassword"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
              <div className="form-text">8 to 72 characters.</div>
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <button type="submit" className="btn btn-primary w-100" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default ResetPasswordPage;
