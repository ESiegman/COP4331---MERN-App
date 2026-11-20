import { postToApp } from "./nativeApp";
import type { Account } from "./types";

// The logged-in user, saved in localStorage so it survives page reloads.
// The token proves to the API who the user is.
export interface Session {
  token: string;
  user: Account;
}

const STORAGE_KEY = "tierlist_session";

// Sent on window when the API says the saved token is no longer valid (see api.ts)
export const SESSION_EXPIRED_EVENT = "tierlist:session-expired";

// What the event above carries, so the login page can say why the person was sent there
export interface SessionEndedDetail {
  message: string;
  kind: "error" | "info";
}

// The Android app needs the login token to register the phone for push notifications, and to
// know when it is logged out. It lives in this page's localStorage, so the page tells the app.
export function announceSession(token: string | null): void {
  postToApp({ type: "session", token });
}

export function getSession(): Session | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as Session;
    return session.token && session.user?._id ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  announceSession(session.token);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  announceSession(null);
}
