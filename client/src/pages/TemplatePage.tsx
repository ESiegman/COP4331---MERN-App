import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/Avatar";
import ImageField from "../components/ImageField";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import RankingCard from "../components/RankingCard";
import ShareButton from "../components/ShareButton";
import TierBoard from "../components/TierBoard";
import { boardFrom } from "../utils/board";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { isModerator } from "../utils/roles";
import { useConfirm } from "../utils/useConfirm";
import { formatDate, nameOf } from "../utils/format";
import type { Item, Ranking, Template, Tier, TemplateDetail, Visibility } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";

function TemplatePage() {
  const { templateId } = useParams();
  const { user } = useAuth();
  const { confirm, confirmWithReason, dialog } = useConfirm();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [community, setCommunity] = useState<{ tiers: Tier[]; rankingCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Owner tools
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState("");

  // Editing the template's details, and renaming one item at a time
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; category: string; coverImageUrl: string; tierLabels: string; visibility: Visibility }>({
    title: "",
    description: "",
    category: "",
    coverImageUrl: "",
    tierLabels: "",
    visibility: "public",
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemImage, setItemImage] = useState("");

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

  function startEditing() {
    if (!detail) return;
    const t = detail.template;
    setForm({ title: t.title, description: t.description ?? "", category: t.category ?? "", coverImageUrl: t.coverImageUrl ?? "", tierLabels: t.tierLabels.join(", "), visibility: t.visibility });
    setEditing(true);
  }

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    const labels = form.tierLabels.split(",").map((label) => label.trim()).filter(Boolean);
    if (labels.length === 0 || labels.length > 12 || labels.some((label) => label.length > 20)) {
      setError("Give between 1 and 12 tier names of up to 20 characters, separated by commas.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiFetch<Template>(`api/templates/${templateId}`, {
      method: "PATCH",
      body: {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        coverImageUrl: form.coverImageUrl.trim() || null,
        tierLabels: labels,
        visibility: form.visibility,
      },
    });
    setBusy(false);
    if (res.ok) {
      // Keep the owner and the other fields the PATCH answer does not repeat
      setDetail((d) => (d ? { ...d, template: { ...d.template, ...res.data } } : d));
      setEditing(false);
    } else {
      setError(res.error ?? "Could not save the template");
    }
  }

  function startEditItem(item: Item) {
    setEditingItemId(item._id);
    setItemName(item.name);
    setItemImage(item.imageUrl ?? "");
  }

  async function saveItem(e: FormEvent) {
    e.preventDefault();
    if (!editingItemId) return;
    setBusy(true);
    setError("");
    const res = await apiFetch<Item>(`api/templates/${templateId}/items/${editingItemId}`, {
      method: "PATCH",
      body: { name: itemName.trim(), imageUrl: itemImage.trim() || null },
    });
    setBusy(false);
    if (res.ok) {
      setDetail((d) => (d ? { ...d, items: d.items.map((i) => (i._id === res.data._id ? res.data : i)) } : d));
      setEditingItemId(null);
    } else {
      setError(res.error ?? "Could not save the item");
    }
  }

  async function removeItem(itemId: string) {
    if (!(await confirm({ title: "Remove item?", message: "It will also come out of every ranking.", confirmLabel: "Remove" }))) return;
    const res = await apiFetch<null>(`api/templates/${templateId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) setDetail((d) => (d ? { ...d, items: d.items.filter((i) => i._id !== itemId) } : d));
    else setError(res.error ?? "Could not remove the item");
  }

  async function deleteTemplate(asModerator: boolean) {
    let reason = "";
    if (asModerator) {
      const answer = await confirmWithReason({
        title: "Remove this template?",
        message: "This removes the template and every ranking of it. Its owner will be notified.",
        confirmLabel: "Remove",
      });
      if (answer === null) return;
      reason = answer;
    } else if (!(await confirm({ title: "Delete template?", message: "This deletes the template and every ranking of it. This can't be undone.", confirmLabel: "Delete" }))) {
      return;
    }
    const res = await apiFetch<null>(`api/templates/${templateId}`, { method: "DELETE", body: reason ? { reason } : undefined });
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
  const canModerate = isModerator(user) && !isOwner;

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
          {isOwner && !editing && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={startEditing}>
              <i className="bi bi-pencil me-1" aria-hidden="true"></i>Edit
            </button>
          )}
          {canModerate && (
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void deleteTemplate(true)}>
              <i className="bi bi-shield-x me-1" aria-hidden="true"></i>Remove
            </button>
          )}
          <ShareButton
            url={detail.shareUrl}
            image={communityBoard && community && community.rankingCount > 0 ? { title: `${template.title}: community ranking`, board: { ...communityBoard, pool: [] }, items } : undefined}
          />
          <button type="button" className="btn btn-primary" onClick={startRanking} disabled={busy || items.length === 0}>
            Rank this
          </button>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {isOwner && editing && (
        <form onSubmit={saveTemplate} className="panel mb-4" aria-label="Edit template">
          <div className="mb-3">
            <label htmlFor="editTitle" className="form-label fw-semibold">Title</label>
            <input id="editTitle" className="form-control" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="mb-3">
            <label htmlFor="editDescription" className="form-label fw-semibold">Description</label>
            <textarea id="editDescription" className="form-control" rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-12 col-sm-6">
              <label htmlFor="editCategory" className="form-label fw-semibold">Category</label>
              <input id="editCategory" className="form-control" maxLength={40} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="col-12 col-sm-6">
              <label htmlFor="editVisibility" className="form-label fw-semibold">Who can see it</label>
              <select id="editVisibility" className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}>
                <option value="public">Everyone, listed in browse</option>
                <option value="unlisted">Anyone with the link</option>
                <option value="private">Only me</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <ImageField label="Cover picture" kind="cover" value={form.coverImageUrl} onChange={(url) => setForm({ ...form, coverImageUrl: url })} disabled={busy} help="Shown on the template's card in browse." />
          </div>
          <div className="mb-3">
            <label htmlFor="editTiers" className="form-label fw-semibold">Tier names, best to worst</label>
            <input id="editTiers" className="form-control" value={form.tierLabels} onChange={(e) => setForm({ ...form, tierLabels: e.target.value })} />
            <div className="form-text">Separate with commas. This only changes rankings started after you save: existing rankings keep their own tiers.</div>
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || !form.title.trim()}>Save changes</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

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
                <>
                  <button type="button" className="btn btn-sm border-0 py-0 px-1" onClick={() => startEditItem(item)} aria-label={`Rename ${item.name}`}>
                    <i className="bi bi-pencil" aria-hidden="true"></i>
                  </button>
                  <button type="button" className="btn btn-sm border-0 py-0 px-1" onClick={() => removeItem(item._id)} aria-label={`Remove ${item.name}`}>
                    <i className="bi bi-x-lg" aria-hidden="true"></i>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            <hr />
            {editingItemId && (
              <form onSubmit={saveItem} className="row g-2 align-items-end mb-3" aria-label="Edit item">
                <div className="col-12 col-md-4">
                  <label htmlFor="editItemName" className="form-label fw-semibold">Item name</label>
                  <input id="editItemName" className="form-control" maxLength={60} value={itemName} onChange={(e) => setItemName(e.target.value)} required />
                </div>
                <div className="col-12 col-md">
                  <ImageField label="Picture (optional)" kind="item" value={itemImage} onChange={setItemImage} disabled={busy} />
                </div>
                <div className="col-12 col-md-auto d-flex gap-2">
                  <button type="submit" className="btn btn-primary" disabled={busy || !itemName.trim()}>Save item</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditingItemId(null)} disabled={busy}>Cancel</button>
                </div>
              </form>
            )}
            <form onSubmit={addItem} className="row g-2 align-items-end">
              <div className="col-12 col-md-4">
                <label htmlFor="itemName" className="form-label fw-semibold">New item</label>
                <input id="itemName" className="form-control" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="col-12 col-md">
                <ImageField label="Picture (optional)" kind="item" value={newImage} onChange={setNewImage} disabled={busy} />
              </div>
              <div className="col-12 col-md-auto">
                <button type="submit" className="btn btn-primary w-100" disabled={busy}>Add item</button>
              </div>
            </form>
            <div className="mt-4">
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void deleteTemplate(false)}>
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
