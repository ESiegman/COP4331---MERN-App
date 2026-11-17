import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "../components/Avatar";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import RankingCard from "../components/RankingCard";
import TemplateCard from "../components/TemplateCard";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { formatDate, nameOf } from "../utils/format";
import type { ModerationUser, Page, PublicProfile, Ranking, Template } from "../utils/types";
import { isModerator } from "../utils/roles";
import { useConfirm } from "../utils/useConfirm";
import { usePagedList } from "../utils/usePagedList";

function ProfileView({ username }: { username: string }) {
  const { user } = useAuth();
  const { confirmWithReason, dialog } = useConfirm();
  const [modMessage, setModMessage] = useState("");
  const [modError, setModError] = useState("");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rankings" | "templates">("rankings");

  // For moderators: is this account banned? The public profile doesn't say, so look in the banned list.
  // null means not known (yet), and then both buttons show.
  const [banned, setBanned] = useState<boolean | null>(null);

  const rankings = usePagedList<Ranking>(username ? `api/users/${username}/rankings` : null, 9);
  const templates = usePagedList<Template>(username ? `api/users/${username}/templates` : null, 9);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<PublicProfile>(`api/users/${username}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setProfile(res.data);
      else setError(res.status === 404 ? "No one has that username." : res.error ?? "Could not load this profile");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const moderator = isModerator(user);
  const profileId = profile?._id;
  const myId = user?._id;
  useEffect(() => {
    if (!moderator || !profileId || profileId === myId) return;
    let cancelled = false;
    async function look() {
      let cursor: string | null = null;
      // The banned list is short; stop after 10 pages (500 accounts) rather than loop forever
      for (let page = 0; page < 10; page++) {
        const res: Awaited<ReturnType<typeof apiFetch<Page<ModerationUser>>>> = await apiFetch<Page<ModerationUser>>(
          `api/admin/users?status=banned&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
        );
        if (cancelled || !res.ok) return;
        if (res.data.items.some((u) => u._id === profileId)) {
          setBanned(true);
          return;
        }
        cursor = res.data.nextCursor;
        if (!cursor) {
          setBanned(false);
          return;
        }
      }
    }
    void look();
    return () => {
      cancelled = true;
    };
  }, [moderator, profileId, myId]);

  if (loading) {
    return (
      <main className="page text-center">
        <span className="spinner-border" role="status" aria-label="Loading"></span>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="page">
        <Notice kind="error">{error}</Notice>
        <Link to="/">Back to browse</Link>
      </main>
    );
  }

  const isMe = user?._id === profile._id;

  async function ban() {
    const reason = await confirmWithReason({
      title: `Ban @${profile?.username}?`,
      message: "They won't be able to log in or use their account until unbanned. Their content stays up.",
      confirmLabel: "Ban",
    });
    if (reason === null) return;
    setModMessage("");
    setModError("");
    const res = await apiFetch<null>(`api/admin/users/${encodeURIComponent(profile?.username ?? "")}/ban`, { method: "POST", body: reason ? { reason } : {} });
    if (res.ok) {
      setModMessage(`@${profile?.username} is banned.`);
      setBanned(true);
    }
    else setModError(res.error ?? "Could not ban this account");
  }

  async function unban() {
    setModMessage("");
    setModError("");
    const res = await apiFetch<null>(`api/admin/users/${encodeURIComponent(profile?.username ?? "")}/ban`, { method: "DELETE" });
    if (res.ok) {
      setModMessage(`@${profile?.username} is no longer banned.`);
      setBanned(false);
    }
    else setModError(res.error ?? "Could not unban this account");
  }
  const list = tab === "rankings" ? rankings : templates;

  return (
    <main className="page">
      <div className="panel d-flex flex-wrap gap-3 align-items-center mb-4">
        <Avatar profile={profile} large />
        <div className="flex-grow-1">
          <h1 className="h3 mb-0">{nameOf(profile)}</h1>
          <div className="muted small">@{profile.username}{profile.createdAt && ` · joined ${formatDate(profile.createdAt)}`}</div>
          {profile.bio && <p className="mb-0 mt-2">{profile.bio}</p>}
        </div>
        {isMe && <Link to="/settings" className="btn btn-outline-primary btn-sm">Edit profile</Link>}
        {isModerator(user) && !isMe && (
          <div className="d-flex gap-2">
            {banned && <span className="badge text-bg-danger align-self-center">Banned</span>}
            {banned !== true && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void ban()}>Ban…</button>}
            {banned !== false && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void unban()}>Unban</button>}
          </div>
        )}
      </div>
      {modError && <Notice kind="error">{modError}</Notice>}
      {modMessage && <Notice kind="success">{modMessage}</Notice>}

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button type="button" className={`nav-link${tab === "rankings" ? " active" : ""}`} onClick={() => setTab("rankings")}>Rankings</button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link${tab === "templates" ? " active" : ""}`} onClick={() => setTab("templates")}>Templates</button>
        </li>
      </ul>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.loading && !list.error && list.items.length === 0 && (
        <Notice>{isMe ? `You haven't made any ${tab} yet.` : `${nameOf(profile)} hasn't shared any ${tab} yet.`}</Notice>
      )}

      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
        {tab === "rankings"
          ? rankings.items.map((ranking) => (
              <div className="col" key={ranking._id}><RankingCard ranking={ranking} /></div>
            ))
          : templates.items.map((template) => (
              <div className="col" key={template._id}><TemplateCard template={template} /></div>
            ))}
      </div>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
      {dialog}
    </main>
  );
}

// Keyed by username so moving between profiles starts with a clean page
function ProfilePage() {
  const { username = "" } = useParams();
  return <ProfileView key={username} username={username} />;
}

export default ProfilePage;
