import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container d-flex flex-wrap justify-content-between gap-2 small" style={{ maxWidth: 1080 }}>
        <span>Tier List</span>
        <nav aria-label="Legal" className="d-flex gap-3">
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
