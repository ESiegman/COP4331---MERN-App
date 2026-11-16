import { useState, type FormEvent } from "react";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import type { Account, NotificationPrefs } from "../utils/types";

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "newRanking", label: "Someone ranks one of my templates" },
  { key: "newComment", label: "Someone comments on my ranking" },
  { key: "newLike", label: "Someone likes my ranking" },
];

function SettingsPage() {
  const { user, updateUser } = useAuth();
  // RequireLogin guarantees there is a user on this page
  const account = user as Account;

  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [bio, setBio] = useState(account.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl ?? "");
  const [prefs, setPrefs] = useState<NotificationPrefs>(account.notificationPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  async function resend() {
    const res = await apiFetch<{ message: string }>("api/auth/resend-verification", {
      method: "POST",
      body: { email: account.email },
    });
    if (res.ok) setMessage(res.data.message);
    else setError(res.error ?? "Could not send a new link");
  }

  return (
    <main className="page" style={{ maxWidth: 680 }}>
      <h1 className="h2 mb-4">Settings</h1>

      {!account.emailVerified && (
        <Notice>
          Your email isn't verified yet.{" "}
          <button type="button" className="btn btn-link p-0 align-baseline" onClick={resend}>Send a new link</button>
        </Notice>
      )}

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
          <label htmlFor="avatarUrl" className="form-label fw-semibold">Profile picture link (https)</label>
          <input id="avatarUrl" type="url" className="form-control" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
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
        </fieldset>

        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}

export default SettingsPage;
