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
import type { PublicProfile, Ranking, Template } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";

function ProfileView({ username }: { username: string }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rankings" | "templates">("rankings");

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
      </div>

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
    </main>
  );
}

// Keyed by username so moving between profiles starts with a clean page
function ProfilePage() {
  const { username = "" } = useParams();
  return <ProfileView key={username} username={username} />;
}

export default ProfilePage;
