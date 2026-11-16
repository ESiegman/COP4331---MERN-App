import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { nameOf, timeAgo } from "../utils/format";
import type { Comment } from "../utils/types";
import { usePagedList } from "../utils/usePagedList";
import Avatar from "./Avatar";
import LoadMore from "./LoadMore";
import Notice from "./Notice";

function CommentSection({ rankingId, ownerId }: { rankingId: string; ownerId: string }) {
  const { user } = useAuth();
  const list = usePagedList<Comment>(`api/rankings/${rankingId}/comments`, 20);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const res = await apiFetch<Comment>(`api/rankings/${rankingId}/comments`, { method: "POST", body: { body } });
    if (res.ok) {
      // Comments are oldest first, so a new one goes at the end
      list.setItems((current) => [...current, res.data]);
      setBody("");
    } else {
      setError(res.error ?? "Could not post your comment");
    }
    setSending(false);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this comment?")) return;
    const res = await apiFetch<null>(`api/comments/${id}`, { method: "DELETE" });
    if (res.ok) list.setItems((current) => current.filter((c) => c._id !== id));
    else setError(res.error ?? "Could not delete the comment");
  }

  return (
    <section aria-labelledby="comments-heading" className="panel mt-4">
      <h2 id="comments-heading" className="h5 mb-3">Comments</h2>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.loading && list.items.length === 0 && !list.error && (
        <p className="muted">No comments yet. Start the conversation.</p>
      )}

      {list.items.map((comment) => {
        // The author can delete their comment, and so can the ranking's owner
        const canDelete = user && (user._id === comment.authorId || user._id === ownerId);
        return (
          <div className="comment d-flex gap-3" key={comment._id}>
            <Avatar profile={comment.author} />
            <div className="flex-grow-1">
              <div className="small">
                {comment.author ? (
                  <Link to={`/u/${comment.author.username}`} className="fw-semibold">{nameOf(comment.author)}</Link>
                ) : (
                  <span className="fw-semibold">Deleted user</span>
                )}
                <span className="muted ms-2">{timeAgo(comment.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{comment.body}</div>
            </div>
            {canDelete && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger align-self-start"
                onClick={() => remove(comment._id)}
                aria-label="Delete comment"
              >
                <i className="bi bi-trash3" aria-hidden="true"></i>
              </button>
            )}
          </div>
        );
      })}

      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />

      <hr />
      {user ? (
        <form onSubmit={send}>
          <label htmlFor="commentBody" className="form-label fw-semibold">Add a comment</label>
          <textarea
            id="commentBody"
            className="form-control mb-2"
            rows={3}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          {error && <Notice kind="error">{error}</Notice>}
          <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>
            {sending ? "Posting…" : "Post comment"}
          </button>
        </form>
      ) : (
        <p className="mb-0">
          <Link to="/login" state={{ from: `/rankings/${rankingId}` }}>Log in</Link> to comment.
        </p>
      )}
    </section>
  );
}

export default CommentSection;
