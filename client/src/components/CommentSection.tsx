import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";
import { nameOf, timeAgo } from "../utils/format";
import type { Comment } from "../utils/types";
import { useConfirm } from "../utils/useConfirm";
import { usePagedList } from "../utils/usePagedList";
import Avatar from "./Avatar";
import LoadMore from "./LoadMore";
import Notice from "./Notice";

function CommentSection({ rankingId, ownerId }: { rankingId: string; ownerId: string }) {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
  const list = usePagedList<Comment>(`api/rankings/${rankingId}/comments`, 20);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Editing one of your own comments
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

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

  function startEdit(comment: Comment) {
    setEditingId(comment._id);
    setEditBody(comment.body);
    setEditError("");
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    setEditError("");
    const res = await apiFetch<Comment>(`api/comments/${id}`, { method: "PATCH", body: { body: editBody } });
    if (res.ok) {
      list.setItems((current) => current.map((c) => (c._id === id ? res.data : c)));
      setEditingId(null);
    } else {
      setEditError(res.error ?? "Could not save your comment");
    }
    setSavingEdit(false);
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Delete comment?", message: "This comment will be removed for everyone.", confirmLabel: "Delete" }))) return;
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
        // Only the author can edit
        const canEdit = user && user._id === comment.authorId;
        const isEditing = editingId === comment._id;
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
              {isEditing ? (
                <div className="mt-1">
                  <label htmlFor={`edit-${comment._id}`} className="visually-hidden">Edit your comment</label>
                  <textarea
                    id={`edit-${comment._id}`}
                    className="form-control mb-2"
                    rows={3}
                    maxLength={1000}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  {editError && <Notice kind="error">{editError}</Notice>}
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => saveEdit(comment._id)}
                      disabled={savingEdit || !editBody.trim()}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingId(null)} disabled={savingEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{comment.body}</div>
              )}
            </div>
            {!isEditing && (canEdit || canDelete) && (
              <div className="d-flex gap-1 align-self-start">
                {canEdit && (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(comment)} aria-label="Edit comment">
                    <i className="bi bi-pencil" aria-hidden="true"></i>
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => remove(comment._id)}
                    aria-label="Delete comment"
                  >
                    <i className="bi bi-trash3" aria-hidden="true"></i>
                  </button>
                )}
              </div>
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
      {dialog}
    </section>
  );
}

export default CommentSection;
