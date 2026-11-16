import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import type { TemplateDetail, Visibility } from "../utils/types";

// One item per line. "Name | https://image-link" adds a picture.
function parseItems(text: string): { name: string; imageUrl: string | null }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, image] = line.split("|").map((part) => part.trim());
      return { name, imageUrl: image ? image : null };
    });
}

function CreateTemplatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tierLabels, setTierLabels] = useState("S, A, B, C, D, F");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [itemsText, setItemsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function suggest() {
    const topic = title.trim();
    if (topic.length < 2) {
      setError("Enter a title first. The suggestions are based on it.");
      return;
    }
    setSuggesting(true);
    setError("");
    setNotice("");
    const res = await apiFetch<{ items: string[] }>("api/templates/suggest-items", {
      method: "POST",
      body: { topic, count: 10 },
    });
    setSuggesting(false);
    if (res.ok) {
      setItemsText((current) => [current.trim(), ...res.data.items].filter(Boolean).join("\n"));
    } else if (res.status === 501) {
      setNotice("AI suggestions aren't available yet. Type your items in below.");
    } else {
      setError(res.error ?? "Could not get suggestions");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const labels = tierLabels.split(",").map((label) => label.trim()).filter(Boolean);
    if (labels.length === 0 || labels.length > 12) {
      setError("Give between 1 and 12 tier names, separated by commas.");
      return;
    }

    setBusy(true);
    const res = await apiFetch<TemplateDetail>("api/templates", {
      method: "POST",
      body: {
        title,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        tierLabels: labels,
        visibility,
        items: parseItems(itemsText),
      },
    });
    setBusy(false);

    if (res.ok) navigate(`/templates/${res.data.template._id}`);
    else setError(res.error ?? "Could not create the template");
  }

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <h1 className="h2 mb-4">New template</h1>
      <form onSubmit={submit} className="panel">
        <div className="mb-3">
          <label htmlFor="title" className="form-label fw-semibold">Title</label>
          <input id="title" className="form-control" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gas station snacks" required />
        </div>

        <div className="mb-3">
          <label htmlFor="description" className="form-label fw-semibold">Description (optional)</label>
          <textarea id="description" className="form-control" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-sm-6">
            <label htmlFor="category" className="form-label fw-semibold">Category (optional)</label>
            <input id="category" className="form-control" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="food" />
          </div>
          <div className="col-12 col-sm-6">
            <label htmlFor="visibility" className="form-label fw-semibold">Who can see it</label>
            <select id="visibility" className="form-select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="public">Everyone, listed in browse</option>
              <option value="unlisted">Anyone with the link</option>
              <option value="private">Only me</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="tiers" className="form-label fw-semibold">Tier names, best to worst</label>
          <input id="tiers" className="form-control" value={tierLabels} onChange={(e) => setTierLabels(e.target.value)} />
          <div className="form-text">Separate with commas. Up to 12 tiers.</div>
        </div>

        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-end">
            <label htmlFor="items" className="form-label fw-semibold">Items to rank</label>
            <button type="button" className="btn btn-sm btn-outline-primary mb-2" onClick={suggest} disabled={suggesting}>
              {suggesting ? "Thinking…" : "Suggest items with AI"}
            </button>
          </div>
          <textarea id="items" className="form-control font-monospace" rows={8} value={itemsText} onChange={(e) => setItemsText(e.target.value)} placeholder={"Beef jerky\nSour gummy worms\nHot Cheetos | https://example.com/cheetos.jpg"} />
          <div className="form-text">One item per line. To add a picture, put its https link after a “|”. You can add more later.</div>
        </div>

        {notice && <Notice>{notice}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create template"}
        </button>
      </form>
    </main>
  );
}

export default CreateTemplatePage;
