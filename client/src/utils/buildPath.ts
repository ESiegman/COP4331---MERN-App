// Turns an API route like "api/cards/123" into the URL to call.
//
// By default this returns "/api/cards/123", a path on the same site the page was
// loaded from. That works everywhere in this project:
//   - local dev:   the Vite dev server proxies /api to the API container
//                  (see vite.config.js)
//   - production:  Caddy serves the app and proxies /api to the API container
//                  (see Caddyfile)
// so there is no CORS to configure and no per-environment API address.
//
// To point at a different API, set VITE_API_BASE_URL (for example in a local,
// uncommitted .env.local file). Use ?? and not || so that an empty value
// stays empty instead of falling back.
export function buildPath(route: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanRoute = route.replace(/^\//, "");

  return `${cleanBase}/${cleanRoute}`;
}
