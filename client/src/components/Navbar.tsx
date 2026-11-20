import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { isModerator } from "../utils/roles";
import { useAuth } from "../utils/useAuth";
import type { AppNotification, Page } from "../utils/types";
import Avatar from "./Avatar";

const POLL_MS = 60_000;

function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [params] = useSearchParams();
  const onSignUp = params.get("mode") === "register";

  // Keep the bell's count fresh while someone is logged in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function check() {
      const res = await apiFetch<Page<AppNotification> & { unreadCount: number }>("api/notifications?limit=1");
      if (!cancelled && res.ok) setUnread(res.data.unreadCount ?? 0);
    }

    void check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  function logOut() {
    signOut();
    setUnread(0);
    navigate("/");
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link-plain${isActive ? " active" : ""}`;

  return (
    <header className="topbar">
      <nav className="navbar navbar-expand-md navbar-dark py-2" aria-label="Main">
        <div className="container" style={{ maxWidth: 1080 }}>
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </span>
            Tier List
          </Link>

          <button
            className="navbar-toggler border-0"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNav"
            aria-controls="mainNav"
            aria-expanded="false"
            aria-label="Show menu"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse" id="mainNav">
            <div className="d-flex flex-column flex-md-row align-items-md-center gap-1 ms-md-auto pt-2 pt-md-0">
              <NavLink to="/" end className={linkClass}>Browse</NavLink>

              {user ? (
                <>
                  <NavLink to="/templates/new" className={linkClass}>New template</NavLink>
                  <NavLink to="/notifications" className={linkClass}>
                    <span className="position-relative d-inline-block">
                      <i className="bi bi-bell-fill" aria-hidden="true"></i>
                      {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
                    </span>
                    <span className="ms-2">
                      Notifications{unread > 0 && <span className="visually-hidden"> ({unread} unread)</span>}
                    </span>
                  </NavLink>
                  <NavLink to={`/u/${user.username}`} className={linkClass}>
                    <span className="d-inline-flex align-items-center gap-2">
                      <Avatar profile={user} />
                      {user.displayName || user.username}
                    </span>
                  </NavLink>
                  <NavLink to="/settings" className={linkClass}>Settings</NavLink>
                  {isModerator(user) && <NavLink to="/admin" className={linkClass}>Moderation</NavLink>}
                  <button type="button" className="btn btn-sm btn-outline-light ms-md-2" onClick={logOut}>
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={({ isActive }) => linkClass({ isActive: isActive && !onSignUp })}>Log in</NavLink>
                  <Link to="/login?mode=register" className="btn btn-sm btn-primary ms-md-2">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
