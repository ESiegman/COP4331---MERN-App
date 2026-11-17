import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/Avatar";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import RankingCard from "../components/RankingCard";
import ShareButton from "../components/ShareButton";
import TierBoard from "../components/TierBoard";
import { boardFrom } from "../utils/board";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { useConfirm } from "../utils/useConfirm";
import { formatDate, nameOf } from "../utils/format";
import type { Item, Ranking, Tier, TemplateDetail } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";

function TemplatePage() {
  const { templateId } = useParams();
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [community, setCommunity] = useState<{ tiers: Tier[]; rankingCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Owner tools
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState("");

  const rankings = usePagedList<Ranking>(templateId ? `api/templates/${templateId}/rankings` : null, 6);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const [one, crowd] = await Promise.all([
        apiFetch<TemplateDetail>(`api/templates/${templateId}`),
        apiFetch<{ tiers: Tier[]; rankingCount: number }>(`api/templates/${templateId}/community-ranking`),
      ]);
      if (cancelled) return;
      if (one.ok) setDetail(one.data);
      else setError(one.status === 404 ? "This template doesn't exist, or it is private." : one.error ?? "Could not load the template");
      if (crowd.ok) setCommunity(crowd.data);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const communityBoard = useMemo(() => (community ? boardFrom(community.tiers, items) : null), [community, items]);

  async function startRanking() {
    if (!user) {
      navigate("/login", { state: { from: `/templates/${templateId}` } });
      return;
    }
    setBusy(true);
    // Get or create: returns your existing ranking of this template if you already have one
    const res = await apiFetch<Ranking>(`api/templates/${templateId}/rankings`, { method: "POST" });
    setBusy(false);
    if (res.ok) navigate(`/rankings/${res.data._id}`);
    else setError(res.error ?? "Could not start your ranking");
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiFetch<Item>(`api/templates/${templateId}/items`, {
      method: "POST",
      body: { name: newName, imageUrl: newImage.trim() || null },
    });
    setBusy(false);
    if (res.ok) {
      setDetail((d) => (d ? { ...d, items: [...d.items, res.data] } : d));
      setNewName("");
      setNewImage("");
    } else {
      setError(res.error ?? "Could not add the item");
    }
  }

  async function removeItem(itemId: string) {
    if (!(await confirm({ title: "Remove item?", message: "It will also come out of every ranking.", confirmLabel: "Remove" }))) return;
    const res = await apiFetch<null>(`api/templates/${templateId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) setDetail((d) => (d ? { ...d, items: d.items.filter((i) => i._id !== itemId) } : d));
    else setError(res.error ?? "Could not remove the item");
  }

  async function deleteTemplate() {
    if (!(await confirm({ title: "Delete template?", message: "This deletes the template and every ranking of it. This can't be undone.", confirmLabel: "Delete" }))) return;
    const res = await apiFetch<null>(`api/templates/${templateId}`, { method: "DELETE" });
    if (res.ok) navigate("/");
    else setError(res.error ?? "Could not delete the template");
  }

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
        <Notice kind="error">{error || "Template not found."}</Notice>
        <Link to="/">Back to browse</Link>
      </main>
    );
  }

  const { template, owner } = detail;
  const isOwner = user?._id === template.ownerId;

  return (
    <main className="page">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 className="h2 mb-2">{template.title}</h1>
          {template.description && <p className="mb-2">{template.description}</p>}
          <div className="d-flex align-items-center gap-2 small muted">
            <Avatar profile={owner} />
            <span>
              by {owner ? <Link to={`/u/${owner.username}`}>{nameOf(owner)}</Link> : "a deleted user"} on {formatDate(template.createdAt)}
            </span>
            {template.category && <span className="badge text-bg-light border">{template.category}</span>}
            {template.visibility !== "public" && <span className="badge text-bg-secondary">{template.visibility}</span>}
          </div>
        </div>
        <div className="d-flex gap-2">
          <ShareButton url={detail.shareUrl} />
          <button type="button" className="btn btn-primary" onClick={startRanking} disabled={busy || items.length === 0}>
            Rank this
          </button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {items.length === 0 && <Notice>This template has no items yet.{isOwner ? " Add some below." : ""}</Notice>}

      <section className="panel mb-4" aria-labelledby="community-heading">
        <h2 id="community-heading" className="h5">Community ranking</h2>
        {communityBoard && community && community.rankingCount > 0 ? (
          <>
            <p className="muted small">Averaged from {community.rankingCount} published {community.rankingCount === 1 ? "ranking" : "rankings"}.</p>
            <TierBoard items={items} board={{ ...communityBoard, pool: [] }} />
          </>
        ) : (
          <p className="muted mb-0">Nobody has published a ranking yet. Yours could be the first.</p>
        )}
      </section>

      <section className="mb-4" aria-labelledby="rankings-heading">
        <h2 id="rankings-heading" className="h5 mb-3">Rankings of this template</h2>
        {rankings.error && <Notice kind="error">{rankings.error}</Notice>}
        {!rankings.loading && rankings.items.length === 0 && <p className="muted">No published rankings yet.</p>}
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
          {rankings.items.map((ranking) => (
            <div className="col" key={ranking._id}>
              <RankingCard ranking={ranking} />
            </div>
          ))}
        </div>
        <LoadMore hasMore={rankings.hasMore} loading={rankings.loading} onClick={rankings.loadMore} />
      </section>

      <section className="panel" aria-labelledby="items-heading">
        <h2 id="items-heading" className="h5 mb-3">Items ({items.length})</h2>
        <ul className="list-unstyled d-flex flex-wrap gap-2 mb-0">
          {items.map((item) => (
            <li key={item._id} className="d-inline-flex align-items-center gap-1 border rounded-pill ps-3 pe-1 py-1 bg-white">
              <span>{item.name}</span>
              {isOwner && (
                <button type="button" className="btn btn-sm border-0 py-0" onClick={() => removeItem(item._id)} aria-label={`Remove ${item.name}`}>
                  <i className="bi bi-x-lg" aria-hidden="true"></i>
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            <hr />
            <form onSubmit={addItem} className="row g-2 align-items-end">
              <div className="col-12 col-md-4">
                <label htmlFor="itemName" className="form-label fw-semibold">New item</label>
                <input id="itemName" className="form-control" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="col-12 col-md">
                <label htmlFor="itemImage" className="form-label fw-semibold">Image link (optional, https)</label>
                <input id="itemImage" type="url" className="form-control" value={newImage} onChange={(e) => setNewImage(e.target.value)} />
              </div>
              <div className="col-12 col-md-auto">
                <button type="submit" className="btn btn-primary w-100" disabled={busy}>Add item</button>
              </div>
            </form>
            <div className="mt-4">
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={deleteTemplate}>
                Delete template
              </button>
            </div>
          </>
        )}
      </section>
      {dialog}
    </main>
  );
}

export default TemplatePage;
