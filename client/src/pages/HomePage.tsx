import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import RankingCard from "../components/RankingCard";
import TemplateCard from "../components/TemplateCard";
import { queryString } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import type { Ranking, Template } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";

type Tab = "rankings" | "templates";

function RankingsTab() {
  const [sort, setSort] = useState<"new" | "top">("new");
  const list = usePagedList<Ranking>(`api/rankings${queryString({ sort })}`);

  return (
    <>
      <div className="btn-group mb-3" role="group" aria-label="Sort rankings">
        <button type="button" className={`btn btn-sm ${sort === "new" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setSort("new")}>
          Newest
        </button>
        <button type="button" className={`btn btn-sm ${sort === "top" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setSort("top")}>
          Most liked
        </button>
      </div>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.loading && !list.error && list.items.length === 0 && (
        <Notice>No rankings have been published yet. Pick a template and publish the first one.</Notice>
      )}
      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
        {list.items.map((ranking) => (
          <div className="col" key={ranking._id}>
            <RankingCard ranking={ranking} />
          </div>
        ))}
      </div>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
    </>
  );
}

function TemplatesTab() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "popular">("popular");
  const list = usePagedList<Template>(`api/templates${queryString({ q, sort })}`);

  function search(e: FormEvent) {
    e.preventDefault();
    setQ(text.trim());
  }

  return (
    <>
      <form onSubmit={search} className="row g-2 mb-3" role="search">
        <div className="col-12 col-md">
          <label htmlFor="templateSearch" className="visually-hidden">Search templates</label>
          <input
            id="templateSearch"
            type="search"
            className="form-control"
            placeholder="Search templates by title, description or category"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="col-6 col-md-auto">
          <label htmlFor="templateSort" className="visually-hidden">Sort templates</label>
          <select id="templateSort" className="form-select" value={sort} onChange={(e) => setSort(e.target.value as "new" | "popular")}>
            <option value="popular">Most ranked</option>
            <option value="new">Newest</option>
          </select>
        </div>
        <div className="col-6 col-md-auto">
          <button type="submit" className="btn btn-primary w-100">Search</button>
        </div>
      </form>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.loading && !list.error && list.items.length === 0 && (
        <Notice>{q ? `No templates match “${q}”.` : "There are no templates yet."}</Notice>
      )}
      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
        {list.items.map((template) => (
          <div className="col" key={template._id}>
            <TemplateCard template={template} />
          </div>
        ))}
      </div>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
    </>
  );
}

function HomePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("templates");

  return (
    <main className="page">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <h1 className="display-6 mb-1">Rank anything.</h1>
          <p className="muted mb-0">Pick a template, drag items into tiers, and see how everyone else ranked it.</p>
        </div>
        <Link to={user ? "/templates/new" : "/login?mode=register"} className="btn btn-primary">
          {user ? "Make a template" : "Sign up to start"}
        </Link>
      </div>

      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation">
          <button type="button" role="tab" aria-selected={tab === "templates"} className={`nav-link${tab === "templates" ? " active" : ""}`} onClick={() => setTab("templates")}>
            Templates
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button type="button" role="tab" aria-selected={tab === "rankings"} className={`nav-link${tab === "rankings" ? " active" : ""}`} onClick={() => setTab("rankings")}>
            Rankings
          </button>
        </li>
      </ul>

      {tab === "templates" ? <TemplatesTab /> : <RankingsTab />}
    </main>
  );
}

export default HomePage;
