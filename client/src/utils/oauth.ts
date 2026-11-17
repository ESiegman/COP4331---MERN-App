import { apiFetch } from "./api";
import type { OAuthProviderId } from "./types";

// Google and Discord sign-in, using the authorization code flow with PKCE.
// The browser runs the provider's sign-in page; only the API holds the client secrets, so the
// API turns the code into who the person is. See "Google and Discord" in server/README.md.

export interface OAuthProviderInfo {
  provider: OAuthProviderId;
  name: string;
  clientId: string;
  authorizeUrl: string;
  scope: string;
}

// "login" signs in (and creates the account the first time); "link" adds the provider to the
// account that is already logged in
export type OAuthPurpose = "login" | "link";

// Everything the callback page needs to finish what the button started
export interface PendingOAuth {
  state: string;
  codeVerifier: string;
  provider: OAuthProviderId;
  purpose: OAuthPurpose;
  // The exact redirect_uri sent to the provider. The API checks the code against the same one.
  redirectUri: string;
  // The page to return to after a login
  from?: string;
}

const STORAGE_KEY = "tierlist_oauth_pending";

export function callbackPath(): string {
  return "/oauth/callback";
}

// https://mern.esiegman.dev/oauth/callback in production, http://localhost:5173/oauth/callback locally.
// Both are registered with Google and Discord and are on the API's allow-list.
export function redirectUri(): string {
  return `${window.location.origin}${callbackPath()}`;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A random URL-safe string. 48 bytes make 64 characters: inside the 43 to 128 PKCE allows.
export function randomString(byteCount = 48): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

// code_challenge = base64url(SHA-256(verifier))
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function savePending(pending: PendingOAuth): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function readPending(): PendingOAuth | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const pending = JSON.parse(stored) as PendingOAuth;
    return pending.state && pending.codeVerifier && pending.provider && pending.redirectUri ? pending : null;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing was saved
  }
}

// Google refuses to show its sign-in page inside an embedded WebView (error 403
// disallowed_useragent), and the mobile app is a WebView around this site. Discord works there.
// Android WebViews put "wv" in the user agent; iOS ones leave out the "Safari" token.
export function isEmbeddedWebView(): boolean {
  const ua = navigator.userAgent;
  return /; wv\)/.test(ua) || (/(iPhone|iPod|iPad)/.test(ua) && !/Safari/.test(ua));
}

export function isProviderUsable(provider: OAuthProviderId): boolean {
  return !(provider === "google" && isEmbeddedWebView());
}

export async function fetchProviders(): Promise<OAuthProviderInfo[]> {
  const res = await apiFetch<{ providers: OAuthProviderInfo[] }>("api/auth/oauth/providers");
  return res.ok ? res.data.providers : [];
}

// Saves what the callback page needs, then sends the browser to the provider.
// Throws an Error with a message that can be shown to the person.
export async function startOAuth(info: OAuthProviderInfo, purpose: OAuthPurpose, from?: string): Promise<void> {
  if (!window.crypto?.subtle) {
    throw new Error("Signing in with Google or Discord needs a secure (https) connection.");
  }

  const state = randomString(32);
  const codeVerifier = randomString(48);
  const challenge = await codeChallenge(codeVerifier);
  const uri = redirectUri();

  savePending({ state, codeVerifier, provider: info.provider, purpose, redirectUri: uri, from });

  const url = new URL(info.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", info.clientId);
  url.searchParams.set("redirect_uri", uri);
  url.searchParams.set("scope", info.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.assign(url.toString());
}
