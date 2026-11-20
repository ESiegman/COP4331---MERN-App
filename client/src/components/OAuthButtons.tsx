import { useState } from "react";
import { isProviderUsable, startOAuth } from "../utils/oauth";
import { useOAuthProviders } from "../utils/useOAuthProviders";
import Notice from "./Notice";

const ICONS = { google: "bi-google", discord: "bi-discord" } as const;

// "Continue with Google" and "Continue with Discord" buttons for the login and sign-up forms.
// A button only shows for a provider that GET /api/auth/oauth/providers lists.
function OAuthButtons({ from }: { from?: string }) {
  const { providers } = useOAuthProviders();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  if (providers.length === 0) return null;

  const usable = providers.filter((p) => isProviderUsable(p.provider));
  const hiddenInApp = providers.length - usable.length;

  async function begin(index: number) {
    setStarting(true);
    setError("");
    try {
      await startOAuth(usable[index], "login", from);
      // The browser is on its way to the provider; nothing more to do here
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sign-in");
      setStarting(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="d-grid gap-2">
        {usable.map((p, i) => (
          <button key={p.provider} type="button" className="btn btn-outline-secondary" onClick={() => void begin(i)} disabled={starting}>
            <i className={`bi ${ICONS[p.provider]} me-2`} aria-hidden="true"></i>
            Continue with {p.name}
          </button>
        ))}
      </div>
      {hiddenInApp > 0 && (
        <p className="small muted mt-2 mb-0">Google sign-in isn't available inside the app. Use your email or Discord, or open the site in your browser.</p>
      )}
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
      <div className="or-divider" role="separator"><span>or use your email</span></div>
    </div>
  );
}

export default OAuthButtons;
