import { buildPath } from "./buildPath";
import { clearSession, getSession } from "./session";

// What the API sends back: the parsed JSON body, plus whether it succeeded
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  // Machine-readable reason, for example EMAIL_NOT_VERIFIED or CONFLICT
  code?: string;
}

// Sends a request to the API.
// - Sends and receives JSON
// - Adds the login token (if there is one) as "Authorization: Bearer <token>"
// - If the API says the token is no longer valid (401), logs the user out
// Network failures do not throw: they come back as { ok: false, status: 0 }.
export async function apiFetch<T>(
  route: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const session = getSession();

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (session) headers["Authorization"] = `Bearer ${session.token}`;

  let response: Response;
  try {
    response = await fetch(buildPath(route), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return { ok: false, status: 0, data: null as T, error: "Could not reach the server. Check your connection." };
  }

  // 204 No Content (for example, after a delete) has no body to parse
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (for example a proxy error page): treat it as no body
  }
  const body = data as { error?: string; code?: string } | null;

  // A 401 on a route that needs a token means the saved token expired or was rejected
  if (response.status === 401 && session) {
    clearSession();
    window.location.href = "/login";
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
    error: response.ok ? undefined : body?.error ?? `Request failed (${response.status})`,
    code: response.ok ? undefined : body?.code,
  };
}

// Builds "?a=1&b=2" from the values that are set
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
