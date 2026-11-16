import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../utils/useAuth";

interface LikeButtonProps {
  rankingId: string;
  initialLiked: boolean;
  initialCount: number;
}

function LikeButton({ rankingId, initialLiked, initialCount }: LikeButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!user) {
      navigate("/login", { state: { from: `/rankings/${rankingId}` } });
      return;
    }
    setBusy(true);
    const res = await apiFetch<{ liked: boolean; likeCount: number }>(`api/rankings/${rankingId}/like`, {
      method: liked ? "DELETE" : "PUT",
    });
    if (res.ok) {
      setLiked(res.data.liked);
      setCount(res.data.likeCount);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      className={`btn btn-sm ${liked ? "btn-primary" : "btn-outline-primary"}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
    >
      <i className={`bi ${liked ? "bi-heart-fill" : "bi-heart"} me-1`} aria-hidden="true"></i>
      {count} {count === 1 ? "like" : "likes"}
    </button>
  );
}

export default LikeButton;
