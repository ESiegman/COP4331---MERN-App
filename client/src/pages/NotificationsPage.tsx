import { useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import LoadMore from "../components/LoadMore";
import Notice from "../components/Notice";
import { apiFetch } from "../utils/api";
import { nameOf, timeAgo } from "../utils/format";
import type { AppNotification, NotificationType } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";

const WHAT: Record<NotificationType, string> = {
  new_ranking: "ranked your template",
  new_comment: "commented on your ranking",
  new_like: "liked your ranking",
};

function NotificationsPage() {
  const navigate = useNavigate();
  const list = usePagedList<AppNotification>("api/notifications", 20);
  const unread = list.items.filter((n) => !n.read).length;

  async function open(notification: AppNotification) {
    if (!notification.read) {
      // Fire and forget: the page changes either way
      void apiFetch<null>(`api/notifications/${notification._id}`, { method: "PATCH", body: { read: true } });
    }
    if (notification.ranking) navigate(`/rankings/${notification.ranking._id}`);
  }

  async function markAllRead() {
    const res = await apiFetch<null>("api/notifications/read-all", { method: "POST" });
    if (res.ok) list.setItems((current) => current.map((n) => ({ ...n, read: true })));
  }

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h2 mb-0">Notifications</h1>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={markAllRead} disabled={unread === 0}>
          Mark all as read
        </button>
      </div>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.loading && !list.error && list.items.length === 0 && (
        <Notice>Nothing yet. You'll see activity on your templates and rankings here.</Notice>
      )}

      <ul className="list-unstyled d-grid gap-2">
        {list.items.map((n) => (
          <li key={n._id}>
            <button
              type="button"
              className="panel w-100 text-start d-flex gap-3 align-items-center"
              style={{ borderLeft: n.read ? undefined : "4px solid var(--accent)" }}
              onClick={() => open(n)}
            >
              <Avatar profile={n.actor} />
              <span className="flex-grow-1">
                <strong>{nameOf(n.actor)}</strong> {WHAT[n.type]}
                {n.ranking?.template?.title ? ` “${n.ranking.template.title}”` : ""}
                <span className="d-block small muted">{timeAgo(n.createdAt)}{!n.read && " · new"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
    </main>
  );
}

export default NotificationsPage;
