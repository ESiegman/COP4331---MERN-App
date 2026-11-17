import { APP_SCHEME, SITE_HOST } from "./site";

// Turns a link the phone opened the app with into a path on the website, or null if it isn't ours.
//
//   https://mern.esiegman.dev/verify-email?token=abc          -> /verify-email?token=abc
//   mernstackandroidmobileapp://reset-password?token=abc       -> /reset-password?token=abc
//   mernstackandroidmobileapp:///rankings/123                  -> /rankings/123
export function pathFromLink(link: string): string | null {
  const match = link.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^#]*)/i);
  if (!match) return null;
  const [, scheme, host, rest] = match;

  if (scheme === "https" || scheme === "http") {
    return host.toLowerCase() === SITE_HOST ? rest || "/" : null;
  }
  if (scheme.toLowerCase() === APP_SCHEME) {
    return host ? `/${host}${rest}` : rest || "/";
  }
  return null;
}

// Where a tapped push notification should go. The server sends rankingId for likes, comments and
// new rankings; a notice that a moderator removed something has none, so show the list instead.
export function pathForNotification(data: Record<string, unknown> | undefined): string {
  const rankingId = typeof data?.rankingId === "string" ? data.rankingId : null;
  return rankingId && /^[A-Za-z0-9]+$/.test(rankingId) ? `/rankings/${rankingId}` : "/notifications";
}
