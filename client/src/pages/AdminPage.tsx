import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Avatar from "../components/Avatar";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { nameOf, timeAgo } from "../utils/format";
import { isAdmin, isModerator } from "../utils/roles";
import type { Account, ModerationAction, ModerationLogEntry, ModerationUser, Role } from "../utils/types";
import { useAuth } from "../utils/useAuth";
import { useConfirm } from "../utils/useConfirm";
import { usePagedList } from "../utils/usePagedList";

type Tab = "staff" | "banned" | "log";

const ACTION_TEXT: Record<ModerationAction, string> = {
  delete_template: "removed a template",
  delete_ranking: "removed a ranking",
  delete_comment: "removed a comment",
  ban: "banned",
  unban: "unbanned",
  set_role: "changed a role:",
};

const ROLES: Role[] = ["user", "moderator", "admin"];

// Moderators: ban and unban, see staff and banned accounts. Admins also change roles and read the log.
function AdminView({ me }: { me: Account }) {
  const admin = isAdmin(me);
  const { confirmWithReason, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("staff");
  const users = usePagedList<ModerationUser>(tab === "log" ? null : `api/admin/users?status=${tab}`, 20);
  const log = usePagedList<ModerationLogEntry>(tab === "log" && admin ? "api/admin/log" : null, 20);

  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Runs one admin request and reports the result. Answers the account the API sent back.
  async function act(method: string, path: string, body?: unknown, done?: string): Promise<ModerationUser | null> {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await apiFetch<ModerationUser>(path, { method, body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "That didn't work");
      return null;
    }
    if (done) setMessage(done);
    users.reload();
    return res.data;
  }

  const userPath = (name: string) => `api/admin/users/${encodeURIComponent(name.trim())}`;

  async function ban(e: FormEvent) {
    e.preventDefault();
    await act("POST", `${userPath(username)}/ban`, reason.trim() ? { reason: reason.trim() } : {}, `Banned @${username.trim()}.`);
  }

  async function banRow(target: ModerationUser) {
    const answer = await confirmWithReason({
      title: `Ban @${target.username}?`,
      message: "They won't be able to log in or use their account until unbanned. Their content stays up.",
      confirmLabel: "Ban",
    });
    if (answer === null) return;
    await act("POST", `${userPath(target.username)}/ban`, answer ? { reason: answer } : {}, `Banned @${target.username}.`);
  }

  async function changeRole(name: string, next: Role) {
    await act("PUT", `${userPath(name)}/role`, { role: next }, `@${name.trim()} is now ${next === "admin" ? "an admin" : next === "moderator" ? "a moderator" : "a regular user"}.`);
  }

  function canBan(target: ModerationUser) {
    if (target._id === me._id || target.role === "admin") return false;
    return target.role !== "moderator" || admin;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "staff", label: "Staff" },
    { id: "banned", label: "Banned" },
    ...(admin ? [{ id: "log" as const, label: "Moderation log" }] : []),
  ];

  return (
    <main className="page" style={{ maxWidth: 820 }}>
      <h1 className="h2 mb-4">Moderation</h1>

      <section className="panel mb-4" aria-labelledby="act-heading">
        <h2 id="act-heading" className="h5 mb-3">Act on an account</h2>
        <form onSubmit={ban} className="row g-2 align-items-end">
          <div className="col-12 col-sm-4">
            <label htmlFor="modUsername" className="form-label fw-semibold">Username</label>
            <input id="modUsername" className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="col-12 col-sm">
            <label htmlFor="modReason" className="form-label fw-semibold">Ban reason (optional)</label>
            <input id="modReason" className="form-control" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="col-12 col-sm-auto d-flex gap-2">
            <button type="submit" className="btn btn-danger" disabled={busy || !username.trim()}>Ban</button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={busy || !username.trim()}
              onClick={() => void act("DELETE", `${userPath(username)}/ban`, undefined, `Unbanned @${username.trim()}.`)}
            >
              Unban
            </button>
          </div>
        </form>

        {admin && (
          <div className="row g-2 align-items-end mt-2">
            <div className="col-12 col-sm-4">
              <label htmlFor="modRole" className="form-label fw-semibold">Role for that username</label>
              <select id="modRole" className="form-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-auto">
              <button type="button" className="btn btn-outline-primary" disabled={busy || !username.trim()} onClick={() => void changeRole(username, role)}>
                Set role
              </button>
            </div>
          </div>
        )}

        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        {message && <div className="mt-3"><Notice kind="success">{message}</Notice></div>}
        <p className="small muted mb-0 mt-2">
          To remove a template, ranking or comment, open it and use its Remove button. The owner is notified.
        </p>
      </section>

      <ul className="nav nav-tabs mb-3">
        {tabs.map((t) => (
          <li className="nav-item" key={t.id}>
            <button type="button" className={`nav-link${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {tab !== "log" && (
        <>
          {users.error && <Notice kind="error">{users.error}</Notice>}
          {!users.loading && !users.error && users.items.length === 0 && (
            <Notice>{tab === "staff" ? "No moderators or admins yet." : "Nobody is banned."}</Notice>
          )}
          <ul className="list-unstyled d-grid gap-2">
            {users.items.map((u) => (
              <li key={u._id} className="panel d-flex flex-wrap gap-3 align-items-center">
                <Avatar profile={u} />
                <div className="flex-grow-1">
                  <Link to={`/u/${u.username}`} className="fw-semibold">{nameOf(u)}</Link>{" "}
                  <span className="muted">@{u.username}</span>{" "}
                  {u.role && u.role !== "user" && <span className="badge text-bg-primary">{u.role}</span>}
                  {u.bannedAt && (
                    <div className="small text-danger">
                      Banned {timeAgo(u.bannedAt)}{u.banReason ? `: ${u.banReason}` : ""}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2 align-items-center">
                  {admin && u._id !== me._id && (
                    <>
                      <label htmlFor={`role-${u._id}`} className="visually-hidden">Role of @{u.username}</label>
                      <select
                        id={`role-${u._id}`}
                        className="form-select form-select-sm"
                        value={u.role ?? "user"}
                        disabled={busy}
                        onChange={(e) => void changeRole(u.username, e.target.value as Role)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </>
                  )}
                  {u.bannedAt ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void act("DELETE", `${userPath(u.username)}/ban`, undefined, `Unbanned @${u.username}.`)}>
                      Unban
                    </button>
                  ) : (
                    canBan(u) && <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void banRow(u)}>Ban…</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <LoadMore hasMore={users.hasMore} loading={users.loading} onClick={users.loadMore} />
        </>
      )}

      {tab === "log" && (
        <>
          {log.error && <Notice kind="error">{log.error}</Notice>}
          {!log.loading && !log.error && log.items.length === 0 && <Notice>Nothing has been logged yet.</Notice>}
          <ul className="list-unstyled d-grid gap-2">
            {log.items.map((entry) => (
              <li key={entry._id} className="panel">
                <div>
                  <strong>{entry.actor ? `@${entry.actor.username}` : "Server command"}</strong> {ACTION_TEXT[entry.action]}{" "}
                  {entry.action !== "set_role" && entry.targetUser && <>@{entry.targetUser.username}{entry.action.startsWith("delete") && "'s content"}</>}
                </div>
                {entry.summary && <div className="small">“{entry.summary}”</div>}
                {entry.reason && <div className="small muted">Reason: {entry.reason}</div>}
                <div className="small muted">{timeAgo(entry.createdAt)}</div>
              </li>
            ))}
          </ul>
          <LoadMore hasMore={log.hasMore} loading={log.loading} onClick={log.loadMore} />
        </>
      )}
      {dialog}
    </main>
  );
}

function AdminPage() {
  const { user } = useAuth();
  // The API enforces this too. The check only decides what to show.
  if (!user || !isModerator(user)) {
    return (
      <main className="page">
        <Notice kind="error">This page is for moderators.</Notice>
        <Link to="/">Back to browse</Link>
      </main>
    );
  }
  return <AdminView me={user} />;
}

export default AdminPage;
