import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ImageField from "../components/ImageField";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { isProviderUsable, startOAuth, type OAuthProviderInfo } from "../utils/oauth";
import { useAuth } from "../utils/useAuth";
import { useConfirm } from "../utils/useConfirm";
import { useOAuthProviders } from "../utils/useOAuthProviders";
import type { Account, LinkedAccount, NotificationPrefs, OAuthProviderId } from "../utils/types";

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "newRanking", label: "Someone ranks one of my templates" },
  { key: "newComment", label: "Someone comments on my ranking" },
  { key: "newLike", label: "Someone likes my ranking" },
];

const PROVIDER_NAMES: Record<OAuthProviderId, string> = { google: "Google", discord: "Discord" };

function SettingsPage() {
  const { user, updateUser, signOut } = useAuth();
  const { confirm, confirmWithPassword, dialog } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  // RequireLogin guarantees there is a user on this page
  const account = user as Account;

  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [bio, setBio] = useState(account.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl ?? "");
  const [prefs, setPrefs] = useState<NotificationPrefs>(account.notificationPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A message handed over by the page that sent the person here (for example "Discord account linked.")
  const [message, setMessage] = useState((location.state as { notice?: string } | null)?.notice ?? "");

  // How this account can log in. Only GET /users/me knows, so ask for it when the page opens.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [methodsError, setMethodsError] = useState("");
  const [methodsMessage, setMethodsMessage] = useState("");
  const [methodsBusy, setMethodsBusy] = useState(false);
  const { providers } = useOAuthProviders();

  // Deleting the account
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<Account>("api/users/me").then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setHasPassword(res.data.hasPassword ?? null);
        setLinked(res.data.linkedAccounts ?? []);
      } else {
        setMethodsError(res.error ?? "Could not load your sign-in methods");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    // An empty box clears the field: the API wants null for that
    const res = await apiFetch<Account>("api/users/me", {
      method: "PATCH",
      body: {
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        notificationPrefs: prefs,
      },
    });
    setBusy(false);

    if (res.ok) {
      updateUser(res.data);
      setMessage("Settings saved.");
    } else {
      setError(res.error ?? "Could not save your settings");
    }
  }

  async function link(info: OAuthProviderInfo) {
    setMethodsError("");
    setMethodsMessage("");
    setMethodsBusy(true);
    try {
      await startOAuth(info, "link");
    } catch (err) {
      setMethodsError(err instanceof Error ? err.message : "Could not start linking");
      setMethodsBusy(false);
    }
  }

  async function unlink(provider: OAuthProviderId) {
    const name = PROVIDER_NAMES[provider];
    const ok = await confirm({
      title: `Unlink ${name}?`,
      message: `You won't be able to log in with ${name} any more.`,
      confirmLabel: "Unlink",
    });
    if (!ok) return;
    setMethodsError("");
    setMethodsMessage("");
    setMethodsBusy(true);
    const res = await apiFetch<null>(`api/users/me/oauth/${provider}`, { method: "DELETE" });
    setMethodsBusy(false);
    if (res.ok) {
      setLinked((current) => current.filter((l) => l.provider !== provider));
      setMethodsMessage(`${name} unlinked.`);
    } else {
      // 409 means it is the only way into the account. The message says what to do.
      setMethodsError(res.error ?? `Could not unlink ${name}`);
    }
  }

  // Accounts made with Google or Discord have no password. Choosing one goes through the same
  // emailed link as "Forgot your password?", which works while logged in too.
  async function setPassword() {
    setMethodsError("");
    setMethodsMessage("");
    setMethodsBusy(true);
    const res = await apiFetch<{ message: string }>("api/auth/forgot-password", { method: "POST", body: { email: account.email } });
    setMethodsBusy(false);
    if (res.ok) setMethodsMessage(`We've emailed a link to ${account.email}. Open it to choose a password.`);
    else setMethodsError(res.error ?? "Could not send the link");
  }

  // DELETE /users/me removes the account and everything it made, for good. An account with a password
  // has to send it; a Google or Discord-only account sends nothing. See server/README.md.
  async function deleteAccount() {
    setDeleteError("");
    const options = {
      title: "Delete your account?",
      message:
        "This permanently deletes your account, your templates (and every ranking made from them), your rankings, comments, likes and uploaded pictures. This can't be undone.",
      confirmLabel: "Delete my account",
    };

    let password: string | undefined;
    if (hasPassword) {
      const typed = await confirmWithPassword(options);
      if (typed === null) return;
      password = typed;
    } else if (!(await confirm(options))) {
      return;
    }

    setDeleting(true);
    const res = await apiFetch<null>("api/users/me", { method: "DELETE", body: password === undefined ? undefined : { password } });
    setDeleting(false);

    if (res.ok) {
      // Leave this page first: RequireLogin would otherwise send them to log in and back here
      navigate("/login", { replace: true, state: { notice: "Your account has been deleted.", noticeKind: "info" } });
      signOut();
      return;
    }

    if (res.code === "WRONG_PASSWORD") setDeleteError("That password is wrong. Your account was not deleted.");
    else if (res.status === 400) setDeleteError("Enter your password to delete your account.");
    else if (res.status === 409) setDeleteError("You are the only admin. Make someone else an admin before you delete your account.");
    else setDeleteError(res.error ?? "Could not delete your account");
  }

  // Show a provider the server has set up, and also one that is linked even if it was switched off
  const rows: { provider: OAuthProviderId; info: OAuthProviderInfo | undefined }[] = (["google", "discord"] as const)
    .map((provider) => ({ provider, info: providers.find((p) => p.provider === provider) }))
    .filter((row) => row.info || linked.some((l) => l.provider === row.provider));

  return (
    <main className="page" style={{ maxWidth: 680 }}>
      <h1 className="h2 mb-4">Settings</h1>

      <form onSubmit={save} className="panel">
        <p className="muted small mb-3">Signed in as @{account.username} ({account.email})</p>

        <div className="mb-3">
          <label htmlFor="displayName" className="form-label fw-semibold">Display name</label>
          <input id="displayName" className="form-control" maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div className="mb-3">
          <label htmlFor="bio" className="form-label fw-semibold">Bio</label>
          <textarea id="bio" className="form-control" rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        <div className="mb-4">
          <ImageField label="Profile picture" kind="avatar" value={avatarUrl} onChange={setAvatarUrl} disabled={busy} />
          <div className="form-text">Remember to press Save changes after choosing a picture.</div>
        </div>

        <fieldset className="mb-4">
          <legend className="h6">Notify me when</legend>
          {PREF_LABELS.map(({ key, label }) => (
            <div className="form-check form-switch mb-2" key={key}>
              <input
                id={`pref-${key}`}
                type="checkbox"
                role="switch"
                className="form-check-input"
                checked={prefs[key]}
                onChange={(e) => setPrefs((current) => ({ ...current, [key]: e.target.checked }))}
              />
              <label htmlFor={`pref-${key}`} className="form-check-label">{label}</label>
            </div>
          ))}
          <div className="form-text">Notices that a moderator removed something of yours can't be turned off.</div>
        </fieldset>

        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section className="panel mt-4" aria-labelledby="signin-heading">
        <h2 id="signin-heading" className="h5 mb-3">Ways to log in</h2>

        <ul className="list-unstyled mb-0">
          {rows.map(({ provider, info }) => {
            const entry = linked.find((l) => l.provider === provider);
            const name = PROVIDER_NAMES[provider];
            return (
              <li key={provider} className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom">
                <span>
                  <i className={`bi ${provider === "google" ? "bi-google" : "bi-discord"} me-2`} aria-hidden="true"></i>
                  <strong>{name}</strong>
                  {entry && <span className="muted"> · Linked{entry.email ? ` (${entry.email})` : ""}</span>}
                </span>
                {entry ? (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void unlink(provider)} disabled={methodsBusy}>
                    Unlink
                  </button>
                ) : info && isProviderUsable(provider) ? (
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void link(info)} disabled={methodsBusy}>
                    Link
                  </button>
                ) : (
                  <span className="small muted">Not available in the app. Link it from your browser.</span>
                )}
              </li>
            );
          })}

          {hasPassword !== null && (
            <li className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2">
              <span>
                <i className="bi bi-key me-2" aria-hidden="true"></i>
                <strong>Password</strong>
                <span className="muted"> · {hasPassword ? "Set" : "Not set"}</span>
              </span>
              {!hasPassword && (
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void setPassword()} disabled={methodsBusy}>
                  Set a password
                </button>
              )}
            </li>
          )}
        </ul>

        {hasPassword === null && !methodsError && <p className="muted small mb-0">Loading…</p>}
        {(methodsError || methodsMessage) && (
          <div className="mt-3">
            {methodsError && <Notice kind="error">{methodsError}</Notice>}
            {methodsMessage && <Notice kind="success">{methodsMessage}</Notice>}
          </div>
        )}
      </section>

      <section className="panel mt-4 border-danger-subtle" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="h5 mb-2">Delete account</h2>
        <p className="muted small">
          Deletes your account and everything it made: your templates and the rankings made from them, your rankings, comments,
          likes and pictures. Your username and email become free to use again. This can't be undone.
        </p>
        {deleteError && <Notice kind="error">{deleteError}</Notice>}
        <button type="button" className="btn btn-outline-danger" onClick={() => void deleteAccount()} disabled={deleting || hasPassword === null}>
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </section>
      {dialog}
    </main>
  );
}

export default SettingsPage;
