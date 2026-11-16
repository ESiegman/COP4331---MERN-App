import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/Avatar";
import CommentSection from "../components/CommentSection";
import LikeButton from "../components/LikeButton";
import Notice from "../components/Notice";
import ShareButton from "../components/ShareButton";
import TierBoard from "../components/TierBoard";
import { boardFrom, type Board } from "../utils/board";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { nameOf, timeAgo } from "../utils/format";
import type { RankingDetail, Visibility } from "../utils/types";

const AUTOSAVE_MS = 800;
const NEW_TIER_COLORS = ["#ff7f7f", "#ffbf7f", "#ffdf7f", "#ffff7f", "#bfff7f", "#7fbfff"];

type SaveState = "idle" | "saving" | "saved" | "error";

function RankingPage() {
  const { rankingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<RankingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The editable copy of the ranking
  const [board, setBoard] = useState<Board>({ tiers: [], pool: [] });
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  // The newest edits, so a delayed save always sends the latest board
  const latest = useRef({ board, title, visibility });
  const timer = useRef<number | null>(null);
  const saveCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const res = await apiFetch<RankingDetail>(`api/rankings/${rankingId}`);
      if (cancelled) return;
      if (res.ok) {
        const next = res.data;
        const initial = boardFrom(next.ranking.tiers, next.items);
        setDetail(next);
        setBoard(initial);
        setTitle(next.ranking.title ?? "");
        setVisibility(next.ranking.visibility);
        setShareUrl(next.shareUrl);
        setPublishedAt(next.ranking.publishedAt);
        latest.current = { board: initial, title: next.ranking.title ?? "", visibility: next.ranking.visibility };
      } else {
        setError(res.status === 404 ? "This ranking doesn't exist, or it isn't public." : res.error ?? "Could not load the ranking");
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [rankingId]);

  async function save(publish: boolean) {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const { board: b, title: t, visibility: v } = latest.current;

    if (b.tiers.some((tier) => !tier.label.trim())) {
      setSaveState("error");
      setSaveError("Every tier needs a name.");
      return;
    }

    const id = ++saveCounter.current;
    setSaveState("saving");
    setSaveError("");

    // Tiers go top to bottom. The server stores each tier's position, so no order is sent.
    const res = await apiFetch<{ ranking: RankingDetail["ranking"]; shareUrl: string }>(`api/rankings/${rankingId}`, {
      method: "PUT",
      body: {
        title: t,
        tiers: b.tiers.map((tier) => ({ label: tier.label.trim(), color: tier.color, itemIds: tier.itemIds })),
        visibility: v,
        publish,
      },
    });
    if (id !== saveCounter.current) return; // a newer save replaced this one

    if (res.ok) {
      setSaveState("saved");
      setShareUrl(res.data.shareUrl);
      setPublishedAt(res.data.ranking.publishedAt);
    } else {
      setSaveState("error");
      setSaveError(res.error ?? "Could not save");
    }
  }

  // Edits are saved a moment after the last change
  function edit(patch: Partial<{ board: Board; title: string; visibility: Visibility }>) {
    latest.current = { ...latest.current, ...patch };
    if (patch.board) setBoard(patch.board);
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.visibility) setVisibility(patch.visibility);
    setSaveState("idle");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(false), AUTOSAVE_MS);
  }

  // Leaving the page with an edit still waiting: send it now
  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        void save(false);
      }
    };
    // save reads only refs and the id, so it is safe to leave out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingId]);

  async function deleteRanking() {
    if (!window.confirm("Delete this ranking? This can't be undone.")) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const res = await apiFetch<null>(`api/rankings/${rankingId}`, { method: "DELETE" });
    if (res.ok) navigate(`/templates/${detail?.template._id ?? ""}`);
    else setError(res.error ?? "Could not delete the ranking");
  }

  function addTier() {
    if (board.tiers.length >= 12) return;
    const color = NEW_TIER_COLORS[board.tiers.length % NEW_TIER_COLORS.length];
    edit({ board: { ...board, tiers: [...board.tiers, { label: "New tier", color, itemIds: [] }] } });
  }

  const items = useMemo(() => detail?.items ?? [], [detail]);

  if (loading) {
    return (
      <main className="page text-center">
        <span className="spinner-border" role="status" aria-label="Loading"></span>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="page">
        <Notice kind="error">{error || "Ranking not found."}</Notice>
        <Link to="/">Back to browse</Link>
      </main>
    );
  }

  const { ranking, template, owner } = detail;
  const isOwner = user?._id === ranking.ownerId;
  const isDraft = publishedAt === null;
  const heading = title || template.title;

  return (
    <main className="page">
      <div className="mb-3">
        <Link to={`/templates/${template._id}`} className="small">
          <i className="bi bi-chevron-left" aria-hidden="true"></i> {template.title}
        </Link>
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="h2 mb-2">
            {heading}{" "}
            {isDraft && <span className="badge text-bg-secondary align-middle fs-6">Draft</span>}
          </h1>
          <div className="d-flex align-items-center gap-2 small muted">
            <Avatar profile={owner} />
            <span>
              Ranked by {owner ? <Link to={`/u/${owner.username}`}>{nameOf(owner)}</Link> : "a deleted user"}
              {publishedAt && ` ${timeAgo(publishedAt)}`}
            </span>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {!isDraft && <LikeButton rankingId={ranking._id} initialLiked={detail.likedByMe} initialCount={ranking.likeCount} />}
          {!isDraft && <ShareButton url={shareUrl} />}
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {isOwner && (
        <div className="panel mb-3">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-5">
              <label htmlFor="rankingTitle" className="form-label fw-semibold">Title</label>
              <input
                id="rankingTitle"
                className="form-control"
                maxLength={100}
                value={title}
                placeholder={template.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
            </div>
            <div className="col-12 col-sm-6 col-md-3">
              <label htmlFor="rankingVisibility" className="form-label fw-semibold">Who can see it</label>
              <select id="rankingVisibility" className="form-select" value={visibility} onChange={(e) => edit({ visibility: e.target.value as Visibility })}>
                <option value="public">Everyone</option>
                <option value="unlisted">Anyone with the link</option>
                <option value="private">Only me</option>
              </select>
            </div>
            <div className="col-12 col-sm-6 col-md-4 d-flex gap-2 justify-content-md-end align-items-center">
              <span className="small muted" role="status" aria-live="polite">
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "Saved"}
              </span>
              {isDraft && (
                <button type="button" className="btn btn-primary" onClick={() => void save(true)} disabled={saveState === "saving"}>
                  Publish
                </button>
              )}
              <button type="button" className="btn btn-outline-danger" onClick={deleteRanking} aria-label="Delete ranking">
                <i className="bi bi-trash3" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          {saveState === "error" && <div className="mt-3"><Notice kind="error">{saveError}</Notice></div>}
          {isDraft ? (
            <p className="small muted mb-0 mt-2">Your changes save automatically. Only you can see this until you publish it.</p>
          ) : (
            <p className="small muted mb-0 mt-2">Published. Your changes save automatically.</p>
          )}
        </div>
      )}

      <TierBoard items={items} board={board} onChange={isOwner ? (next) => edit({ board: next }) : undefined} />

      {isOwner && (
        <div className="mt-3">
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={addTier} disabled={board.tiers.length >= 12}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>Add a tier
          </button>
        </div>
      )}

      {!isDraft && <CommentSection rankingId={ranking._id} ownerId={ranking.ownerId} />}
    </main>
  );
}

export default RankingPage;
