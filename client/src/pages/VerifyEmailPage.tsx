import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import type { AuthResponse } from "../utils/types";

// The page the verification email links to: /verify-email?token=...
function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(token ? "" : "This link is missing its token. Open the link from your email again.");
  // The link works once. React's StrictMode runs effects twice in development, so remember we already used it.
  const used = useRef(false);

  useEffect(() => {
    if (!token || used.current) return;
    used.current = true;

    void apiFetch<AuthResponse>("api/auth/verify-email", { method: "POST", body: { token } }).then((res) => {
      if (res.ok) {
        signIn({ token: res.data.token, user: res.data.user });
        navigate("/", { replace: true });
      } else {
        setError(res.error ?? "This link is no longer valid.");
      }
    });
  }, [token, signIn, navigate]);

  return (
    <main className="page d-flex justify-content-center">
      <div className="panel w-100 text-center" style={{ maxWidth: 440 }}>
        <h1 className="h3 mb-3">Verifying your email</h1>
        {error ? (
          <>
            <Notice kind="error">{error}</Notice>
            <p className="mb-0">
              Links expire after 24 hours and work once. <Link to="/login">Log in</Link> to request a new one.
            </p>
          </>
        ) : (
          <span className="spinner-border" role="status" aria-label="Verifying"></span>
        )}
      </div>
    </main>
  );
}

export default VerifyEmailPage;
