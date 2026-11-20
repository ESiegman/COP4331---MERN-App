import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SESSION_EXPIRED_EVENT, type SessionEndedDetail } from "../utils/session";

// When the API rejects the saved login token (or the account was banned), send the person to the login page
// without reloading the app, and bring them back to this page after they log in.
function SessionExpiryWatcher() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onExpired(event: Event) {
      const detail = (event as CustomEvent<SessionEndedDetail | undefined>).detail;
      navigate("/login", {
        replace: true,
        state: { from: location.pathname, notice: detail?.message, noticeKind: detail?.kind },
      });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate, location.pathname]);

  return null;
}

export default SessionExpiryWatcher;
