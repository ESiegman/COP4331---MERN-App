import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { clearPending, fetchProviders, readPending, startOAuth, type PendingOAuth } from "../utils/oauth";
import type { AuthResponse, LinkedAccount } from "../utils/types";
import { useAuth } from "../utils/useAuth";

const PROVIDER_NAMES = { google: "Google", discord: "Discord" } as const;

interface Problem {
  message: string;
  // OAUTH_CODE_INVALID: the code expired or was used, so starting again can work
  canRetry: boolean;
  pending: PendingOAuth | null;
}

// Where Google and Discord send the person back to: /oauth/callback?code=...&state=...
// It finishes a login (POST /auth/oauth/:provider) or a link (POST /users/me/oauth/:provider).
function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [retrying, setRetrying] = useState(false);
  // An authorization code works once. React runs effects twice in development, so make sure
  // only one request is ever sent for this page.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function finish() {
      const pending = readPending();
      const backTo = pending?.purpose === "link" ? "/settings" : "/login";
      const fail = (message: string, canRetry = false) => setProblem({ message, canRetry, pending });

      const providerError = params.get("error");
      if (providerError) {
        clearPending();
        if (providerError === "access_denied") {
          // Going back keeps the message and, for a login, the page the person came from
          navigate(backTo, { replace: true, state: { notice: "Sign-in was cancelled.", from: pending?.from } });
        } else {
          fail("The sign-in was refused. Please go back and try again.");
        }
        return;
      }

      const code = params.get("code");
      const state = params.get("state");

      if (!pending) {
        fail("This sign-in has expired or was already used. Please start again from the login page.");
        return;
      }
      if (!state || state !== pending.state) {
        // The answer did not come from the sign-in this browser started: do not trust it
        clearPending();
        fail("We couldn't verify this sign-in, so it was stopped. Please start again.");
        return;
      }
      if (!code) {
        clearPending();
        fail("The sign-in didn't come back with a code. Please start again.");
        return;
      }

      const route = pending.purpose === "link" ? `api/users/me/oauth/${pending.provider}` : `api/auth/oauth/${pending.provider}`;
      const res = await apiFetch<AuthResponse | LinkedAccount>(route, {
        method: "POST",
        // redirectUri must be exactly the one the sign-in started with
        body: { code, codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri },
      });
      // The code and verifier are single use: drop them whatever the answer was
      clearPending();

      if (res.ok) {
        if (pending.purpose === "link") {
          navigate("/settings", { replace: true, state: { notice: `${PROVIDER_NAMES[pending.provider]} account linked.` } });
        } else {
          signIn(res.data as AuthResponse);
          // Replacing the page also removes ?code=... from the address bar
          navigate(pending.from || "/", { replace: true });
        }
        return;
      }

      // res.error is written to be shown to people
      if (res.code === "OAUTH_CODE_INVALID") {
        fail(res.error ?? "That sign-in expired.", true);
      } else if (res.code === "OAUTH_FAILED" || res.code === "OAUTH_UNAVAILABLE") {
        fail(`${res.error ?? "Sign-in isn't working right now."} Please try again later.`);
      } else {
        fail(res.error ?? "Could not finish signing in.");
      }
    }

    void finish();
  }, [params, navigate, signIn]);

  async function tryAgain() {
    if (!problem?.pending) return;
    const { provider, purpose, from } = problem.pending;
    setRetrying(true);
    try {
      const info = (await fetchProviders()).find((p) => p.provider === provider);
      if (!info) throw new Error(`${PROVIDER_NAMES[provider]} sign-in isn't available right now.`);
      await startOAuth(info, purpose, from);
    } catch (err) {
      setProblem({ ...problem, canRetry: false, message: err instanceof Error ? err.message : "Could not start sign-in" });
      setRetrying(false);
    }
  }

  const backTo = problem?.pending?.purpose === "link" ? "/settings" : "/login";
  const backLabel = backTo === "/settings" ? "Back to settings" : "Back to log in";

  return (
    <main className="page d-flex justify-content-center">
      <div className="panel w-100" style={{ maxWidth: 440 }}>
        {problem ? (
          <>
            <h1 className="h3 mb-3">Sign-in didn't finish</h1>
            <Notice kind="error">{problem.message}</Notice>
            <div className="d-flex flex-wrap gap-2">
              {problem.canRetry && (
                <button type="button" className="btn btn-primary" onClick={() => void tryAgain()} disabled={retrying}>
                  {retrying ? "Please wait…" : "Try again"}
                </button>
              )}
              <Link to={backTo} replace className="btn btn-outline-secondary">{backLabel}</Link>
            </div>
          </>
        ) : (
          <div className="text-center py-3" role="status">
            <span className="spinner-border mb-3" aria-hidden="true"></span>
            <p className="mb-0">Finishing sign-in…</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default OAuthCallbackPage;
