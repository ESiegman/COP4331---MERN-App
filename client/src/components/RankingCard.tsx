import { Link } from "react-router-dom";
import { nameOf, timeAgo } from "../utils/format";
import type { Ranking } from "../utils/types";
import Avatar from "./Avatar";

function RankingCard({ ranking }: { ranking: Ranking }) {
  const title = ranking.title || ranking.template?.title || "Untitled ranking";
  const placed = ranking.tiers.reduce((sum, tier) => sum + tier.itemIds.length, 0);

  return (
    <Link to={`/rankings/${ranking._id}`} className="tile-card">
      {/* A small preview of the board: each tier as a bar, as wide as the items placed in it */}
      <div className="tile-cover tile-cover-stripes" aria-hidden="true">
        {ranking.tiers.slice(0, 6).map((tier, i) => (
          <span
            key={`${tier.label}-${i}`}
            style={{ background: tier.color, width: `${placed ? Math.max(8, (tier.itemIds.length / placed) * 100) : 8}%` }}
          ></span>
        ))}
      </div>
      <div className="tile-body">
        <h3 className="h6 mb-1 text-truncate">{title}</h3>
        <div className="d-flex align-items-center gap-2 small muted">
          <Avatar profile={ranking.owner} />
          <span className="text-truncate">{nameOf(ranking.owner)}</span>
        </div>
        <div className="small muted mt-2 d-flex gap-3">
          <span><i className="bi bi-heart-fill me-1" aria-hidden="true"></i>{ranking.likeCount}</span>
          <span><i className="bi bi-chat-fill me-1" aria-hidden="true"></i>{ranking.commentCount}</span>
          {ranking.publishedAt ? <span>{timeAgo(ranking.publishedAt)}</span> : <span className="badge text-bg-secondary">Draft</span>}
        </div>
      </div>
    </Link>
  );
}

export default RankingCard;
