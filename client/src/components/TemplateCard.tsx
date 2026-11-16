import { Link } from "react-router-dom";
import { nameOf } from "../utils/format";
import type { Template } from "../utils/types";

const DEFAULT_COLORS = ["#ff7f7f", "#ffbf7f", "#ffdf7f", "#ffff7f", "#bfff7f", "#7fbfff"];

function TemplateCard({ template }: { template: Template }) {
  const stripes = template.tierLabels.slice(0, 6);

  return (
    <Link to={`/templates/${template._id}`} className="tile-card">
      {template.coverImageUrl ? (
        <div className="tile-cover" style={{ backgroundImage: `url(${template.coverImageUrl})` }} role="img" aria-label="" />
      ) : (
        <div className="tile-cover tile-cover-stripes" aria-hidden="true">
          {stripes.map((label, i) => (
            <span key={`${label}-${i}`} style={{ background: DEFAULT_COLORS[i % DEFAULT_COLORS.length], opacity: 1 - i * 0.06 }}></span>
          ))}
        </div>
      )}
      <div className="tile-body">
        <h3 className="h6 mb-1 text-truncate">{template.title}</h3>
        <div className="small muted text-truncate">
          by {nameOf(template.owner)}
          {template.category ? ` in ${template.category}` : ""}
        </div>
        <div className="small muted mt-2">
          <i className="bi bi-list-ol me-1" aria-hidden="true"></i>
          {template.rankingCount} {template.rankingCount === 1 ? "ranking" : "rankings"}
        </div>
      </div>
    </Link>
  );
}

export default TemplateCard;
